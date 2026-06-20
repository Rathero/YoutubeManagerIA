import { exec } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";
import { pixelSize, type VideoClipRequest, type VideoClipResult, type VideoProvider } from "./provider.js";

const pexec = promisify(exec);

async function hasFfmpeg(): Promise<boolean> {
  try {
    await pexec("ffmpeg -version");
    return true;
  } catch {
    return false;
  }
}

/**
 * Stub video provider — no external API. If ffmpeg is present it renders a real
 * solid-color clip of the right size/duration with the prompt drawn on it; otherwise
 * it writes a JSON "clip manifest". Lets the generative pipeline run end-to-end offline.
 */
export class StubVideoProvider implements VideoProvider {
  readonly name = "stub";
  available(): boolean {
    return true;
  }

  async generateClip(req: VideoClipRequest): Promise<VideoClipResult> {
    const { w, h } = pixelSize(req.aspectRatio, req.resolution);
    await mkdir(dirname(req.outPath), { recursive: true });

    if (await hasFfmpeg()) {
      const label = req.prompt.replace(/[\\:']/g, " ").slice(0, 80);
      const cmd =
        `ffmpeg -y -f lavfi -i color=c=0x111827:s=${w}x${h}:d=${req.seconds} ` +
        `-vf "drawtext=text='${label}':fontcolor=white:fontsize=${Math.round(w / 28)}:` +
        `x=(w-text_w)/2:y=(h-text_h)/2" -c:v libx264 -pix_fmt yuv420p -t ${req.seconds} "${req.outPath}"`;
      await pexec(cmd);
      return { path: req.outPath, mimeType: "video/mp4", durationSec: req.seconds, hasAudio: false };
    }

    const manifestPath = req.outPath.replace(/\.mp4$/, ".clip.json");
    await writeFile(
      manifestPath,
      JSON.stringify(
        { kind: "stub-clip", prompt: req.prompt, negativePrompt: req.negativePrompt, size: { w, h }, seconds: req.seconds },
        null,
        2,
      ),
    );
    return { path: manifestPath, mimeType: "application/json", durationSec: req.seconds, hasAudio: false };
  }
}
