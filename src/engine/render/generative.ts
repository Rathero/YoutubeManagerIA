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
import { buildVideoPrompt, resolveStyle, type Shot } from "../visuals/style.js";
import { getVideoProvider } from "../video/registry.js";
import { pixelSize } from "../video/provider.js";
import { StubVideoProvider } from "../video/stub.js";
import { getImageProvider, StubImageProvider } from "../image/provider.js";

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

interface ClipResult {
  path: string;
  mimeType: string;
}

/** Animate a still with a Ken Burns slow zoom into a clip of `seconds` (needs ffmpeg). */
async function kenBurns(imagePath: string, outPath: string, seconds: number, w: number, h: number): Promise<void> {
  const fps = 25;
  const frames = Math.max(1, Math.round(seconds * fps));
  await pexec(
    `ffmpeg -y -loop 1 -i "${imagePath}" -t ${seconds} ` +
      `-vf "scale=${w * 2}:${h * 2},zoompan=z='min(zoom+0.0012,1.4)':d=${frames}:s=${w}x${h}:fps=${fps},format=yuv420p" ` +
      `-c:v libx264 -pix_fmt yuv420p "${outPath}"`,
  );
}

/**
 * Generative render with three sub-modes (all behind one stage):
 *  - generative: one AI video clip per shot (Veo/Sora/Runway, or local Wan/LTX/Hunyuan)
 *  - images:     one AI still per shot (FLUX/SDXL local, or OpenAI) + Ken Burns — cheapest
 * Clips are stitched and the narration is laid over them. Falls back to a manifest when
 * ffmpeg or the provider is unavailable.
 */
export async function renderGenerative(input: GenerativeRenderInput): Promise<RenderedAsset> {
  const video = input.channel.video!;
  const style = resolveStyle(video);
  const mode = video.mode === "images" ? "images" : "generative";
  const ffmpeg = await hasFfmpeg();
  const { w, h } = pixelSize(input.aspectRatio, video.resolution === "4k" ? "1080p" : video.resolution);

  const storyboard = await buildStoryboard(input.llm, input.payload, input.script, video, style.descriptor);
  input.log("info", "storyboard built", {
    format: input.script.format,
    shots: storyboard.shots.length,
    style: style.key,
    mode,
  });

  const workDir = join(dirname(input.outPath), `${input.script.format}-${input.aspectRatio.replace(":", "x")}-clips`);
  await mkdir(workDir, { recursive: true });

  let providerName: string;
  let fellBack: boolean;
  const clips: ClipResult[] = [];
  const promptByShot: Record<number, unknown> = {};

  if (mode === "images") {
    const { provider, fellBack: fb } = getImageProvider(input.channel.image ?? { provider: "stub" });
    providerName = provider.name;
    fellBack = fb;
    if (fb) input.log("warn", `image provider unavailable; using stub stills`);
    const stubImg = new StubImageProvider();
    for (const shot of storyboard.shots) {
      const prompt = buildVideoPrompt("stub", shot, style, input.aspectRatio); // image prompt = scene+style, no video conventions
      promptByShot[shot.index] = prompt;
      const imgPath = join(workDir, `shot-${pad(shot.index)}.png`);
      const req = { prompt: prompt.prompt, negativePrompt: prompt.negativePrompt, width: w, height: h, outPath: imgPath, seed: shot.index + 1 };
      let img;
      try {
        img = await provider.generateImage(req);
      } catch (err) {
        input.log("warn", `image provider "${provider.name}" failed; using stub`, { error: (err as Error).message });
        img = await stubImg.generateImage(req);
        fellBack = true;
      }
      if (img.mimeType === "image/png" && ffmpeg) {
        const clipPath = join(workDir, `shot-${pad(shot.index)}.mp4`);
        await kenBurns(img.path, clipPath, shot.seconds, w, h);
        clips.push({ path: clipPath, mimeType: "video/mp4" });
      } else {
        clips.push({ path: img.path, mimeType: img.mimeType });
      }
    }
  } else {
    const { provider, fellBack: fb } = getVideoProvider(video.provider, { workflow: video.workflow });
    providerName = provider.name;
    fellBack = fb;
    if (fb) input.log("warn", `video provider "${video.provider}" unavailable; using stub clips`);
    const stubVid = new StubVideoProvider();
    for (const shot of storyboard.shots) {
      const prompt = buildVideoPrompt(video.provider, shot, style, input.aspectRatio);
      promptByShot[shot.index] = prompt;
      const clipPath = join(workDir, `shot-${pad(shot.index)}.mp4`);
      const req = {
        prompt: prompt.prompt,
        negativePrompt: prompt.negativePrompt,
        seconds: shot.seconds,
        aspectRatio: input.aspectRatio,
        resolution: video.resolution,
        outPath: clipPath,
        nativeAudio: video.use_native_audio,
      };
      let res;
      try {
        res = await provider.generateClip(req);
      } catch (err) {
        input.log("warn", `video provider "${provider.name}" failed; using stub`, { error: (err as Error).message });
        res = await stubVid.generateClip(req);
        fellBack = true;
      }
      clips.push({ path: res.path, mimeType: res.mimeType });
    }
  }

  const realClips = clips.length > 0 && clips.every((c) => c.mimeType === "video/mp4");

  if (realClips && ffmpeg) {
    await stitch(clips.map((c) => c.path), input, video, w, h);
    return {
      format: input.script.format,
      aspectRatio: input.aspectRatio,
      path: input.outPath,
      durationSec: Math.min(storyboard.totalSeconds, input.audio.durationSec || storyboard.totalSeconds),
      mimeType: "video/mp4",
    };
  }

  // Fallback manifest (offline / no provider).
  const manifestPath = input.outPath.replace(/\.mp4$/, ".generative.json");
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        kind: "generative-manifest",
        mode,
        provider: providerName,
        requestedProvider: mode === "images" ? input.channel.image?.provider : video.provider,
        fellBack,
        style: style.key,
        aspectRatio: input.aspectRatio,
        resolution: video.resolution,
        narrationAudio: input.audio.path,
        useNativeAudio: video.use_native_audio,
        shots: storyboard.shots.map((s: Shot) => ({
          index: s.index,
          seconds: s.seconds,
          narration: s.narration,
          prompt: promptByShot[s.index],
          asset: clips[s.index]?.path,
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

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Normalize → concat → lay narration audio (or keep native audio). */
async function stitch(
  clipPaths: string[],
  input: GenerativeRenderInput,
  video: ChannelDefinition["video"],
  w: number,
  h: number,
): Promise<void> {
  const workDir = dirname(clipPaths[0]!);
  const normalized: string[] = [];
  for (let i = 0; i < clipPaths.length; i++) {
    const norm = join(workDir, `norm-${i}.mp4`);
    await pexec(
      `ffmpeg -y -i "${clipPaths[i]}" -vf "scale=${w}:${h}:force_original_aspect_ratio=decrease,` +
        `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30" -an -c:v libx264 -pix_fmt yuv420p "${norm}"`,
    );
    normalized.push(norm);
  }
  const listFile = join(workDir, "list.txt");
  await writeFile(listFile, normalized.map((p) => `file '${p}'`).join("\n"));
  const concat = join(workDir, "concat.mp4");
  await pexec(`ffmpeg -y -f concat -safe 0 -i "${listFile}" -c copy "${concat}"`);

  if (video?.use_native_audio) {
    await pexec(`ffmpeg -y -i "${concat}" -c copy "${input.outPath}"`);
  } else {
    await pexec(
      `ffmpeg -y -i "${concat}" -i "${input.audio.path}" -map 0:v -map 1:a -c:v copy -c:a aac -shortest "${input.outPath}"`,
    );
  }
}
