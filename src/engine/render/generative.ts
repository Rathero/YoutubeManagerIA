import { exec } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import type {
  AudioAsset,
  ChannelDefinition,
  ContentPayload,
  FormatScript,
  RenderedAsset,
} from "../../core/types/index.js";
import type { LlmClient } from "../llm/client.js";
import { buildStoryboard } from "../visuals/storyboard.js";
import { buildVideoPrompt, resolveStyle } from "../visuals/style.js";
import { getVideoProvider } from "../video/registry.js";
import { pixelSize } from "../video/provider.js";

const pexec = promisify(exec);

async function hasFfmpeg(): Promise<boolean> {
  try {
    await pexec("ffmpeg -version");
    return true;
  } catch {
    return false;
  }
}

export interface GenerativeRenderInput {
  channel: ChannelDefinition;
  payload: ContentPayload;
  script: FormatScript;
  audio: AudioAsset;
  aspectRatio: string;
  outPath: string;
  llm: LlmClient | null;
  log: (level: "debug" | "info" | "warn" | "error", msg: string, extra?: Record<string, unknown>) => void;
}

/**
 * Generative render: plan a storyboard, generate one AI clip per shot with the
 * configured provider+style, then stitch the clips and lay the narration over them.
 * Without ffmpeg (or when the provider falls back to the stub manifest), it emits a
 * generative manifest describing exactly what would be produced.
 */
export async function renderGenerative(input: GenerativeRenderInput): Promise<RenderedAsset> {
  const video = input.channel.video!;
  const style = resolveStyle(video);
  const { provider, fellBack } = getVideoProvider(video.provider);
  if (fellBack) input.log("warn", `video provider "${video.provider}" unavailable; using stub clips`);

  const storyboard = await buildStoryboard(input.llm, input.payload, input.script, video, style.descriptor);
  input.log("info", "storyboard built", { format: input.script.format, shots: storyboard.shots.length, style: style.key });

  const workDir = join(dirname(input.outPath), `${input.script.format}-${input.aspectRatio.replace(":", "x")}-clips`);
  await mkdir(workDir, { recursive: true });

  // 1) generate clips
  const clips: { path: string; mimeType: string; durationSec: number; hasAudio: boolean }[] = [];
  for (const shot of storyboard.shots) {
    const prompt = buildVideoPrompt(video.provider, shot, style, input.aspectRatio);
    const clipPath = join(workDir, `shot-${String(shot.index).padStart(2, "0")}.mp4`);
    const res = await provider.generateClip({
      prompt: prompt.prompt,
      negativePrompt: prompt.negativePrompt,
      seconds: shot.seconds,
      aspectRatio: input.aspectRatio,
      resolution: video.resolution,
      outPath: clipPath,
      nativeAudio: video.use_native_audio,
    });
    clips.push(res);
  }

  const realClips = clips.every((c) => c.mimeType === "video/mp4");
  const ffmpeg = await hasFfmpeg();

  // 2a) stitch with ffmpeg when we have real mp4 clips
  if (realClips && ffmpeg) {
    const { w, h } = pixelSize(input.aspectRatio, video.resolution === "4k" ? "1080p" : video.resolution);
    const normalized: string[] = [];
    for (let i = 0; i < clips.length; i++) {
      const norm = join(workDir, `norm-${i}.mp4`);
      await pexec(
        `ffmpeg -y -i "${clips[i]!.path}" -vf "scale=${w}:${h}:force_original_aspect_ratio=decrease,` +
          `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30" -an -c:v libx264 -pix_fmt yuv420p "${norm}"`,
      );
      normalized.push(norm);
    }
    const listFile = join(workDir, "list.txt");
    await writeFile(listFile, normalized.map((p) => `file '${p}'`).join("\n"));
    const concat = join(workDir, "concat.mp4");
    await pexec(`ffmpeg -y -f concat -safe 0 -i "${listFile}" -c copy "${concat}"`);

    // 2b) lay narration audio (unless using provider-native audio)
    if (video.use_native_audio) {
      await pexec(`ffmpeg -y -i "${concat}" -c copy "${input.outPath}"`);
    } else {
      await pexec(
        `ffmpeg -y -i "${concat}" -i "${input.audio.path}" -map 0:v -map 1:a ` +
          `-c:v copy -c:a aac -shortest "${input.outPath}"`,
      );
    }
    return {
      format: input.script.format,
      aspectRatio: input.aspectRatio,
      path: input.outPath,
      durationSec: Math.min(storyboard.totalSeconds, input.audio.durationSec || storyboard.totalSeconds),
      mimeType: "video/mp4",
    };
  }

  // 3) fallback: generative manifest (offline / stub)
  const manifestPath = input.outPath.replace(/\.mp4$/, ".generative.json");
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        kind: "generative-manifest",
        provider: provider.name,
        requestedProvider: video.provider,
        style: style.key,
        aspectRatio: input.aspectRatio,
        resolution: video.resolution,
        narrationAudio: input.audio.path,
        useNativeAudio: video.use_native_audio,
        shots: storyboard.shots.map((s) => ({
          index: s.index,
          seconds: s.seconds,
          narration: s.narration,
          prompt: buildVideoPrompt(video.provider, s, style, input.aspectRatio),
          clip: clips[s.index]?.path,
        })),
      },
      null,
      2,
    ),
  );
  return {
    format: input.script.format,
    aspectRatio: input.aspectRatio,
    path: manifestPath,
    durationSec: storyboard.totalSeconds,
    mimeType: "application/json",
  };
}
