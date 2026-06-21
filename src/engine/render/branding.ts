import { exec } from "node:child_process";
import { access, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import type { ChannelDefinition } from "../../core/types/index.js";

const pexec = promisify(exec);

type Branding = NonNullable<ChannelDefinition["render"]["branding"]>;
type WatermarkPosition = Branding["watermark"]["position"];

async function hasFfmpeg(): Promise<boolean> {
  try {
    await pexec("ffmpeg -version");
    return true;
  } catch {
    return false;
  }
}

async function exists(path: string | undefined): Promise<boolean> {
  if (!path) return false;
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * FFmpeg `overlay` x:y expression for a corner placement with a pixel margin.
 * Uses `main_w`/`overlay_w` so it works regardless of the scaled logo size. Pure — unit tested.
 */
export function overlayXY(position: WatermarkPosition, margin: number): string {
  const m = Math.max(0, Math.round(margin));
  switch (position) {
    case "top-left":
      return `${m}:${m}`;
    case "bottom-left":
      return `${m}:main_h-overlay_h-${m}`;
    case "bottom-right":
      return `main_w-overlay_w-${m}:main_h-overlay_h-${m}`;
    case "top-right":
    default:
      return `main_w-overlay_w-${m}:${m}`;
  }
}

/**
 * Build the `-filter_complex` graph that scales the logo to `scale`×video-width, applies
 * `opacity`, and overlays it at the chosen corner. Pure so it can be asserted in tests.
 */
export function watermarkFilter(
  position: WatermarkPosition,
  scale: number,
  opacity: number,
  margin: number,
): string {
  const s = Math.min(1, Math.max(0.01, scale));
  const a = Math.min(1, Math.max(0, opacity));
  return (
    `[1:v]scale=iw*${s}:-1[wm0];` +
    `[wm0]format=rgba,colorchannelmixer=aa=${a}[wm];` +
    `[0:v][wm]overlay=${overlayXY(position, margin)}:format=auto[v]`
  );
}

/** True when branding would change the video (some asset is present and enabled). */
export function brandingActive(branding: Branding | undefined): boolean {
  if (!branding) return false;
  const wm = branding.watermark;
  return Boolean(branding.intro || branding.outro || (wm?.enabled && wm.path));
}

export interface BrandingResult {
  applied: boolean;
  steps: string[];
}

/**
 * Render post-pass: overlay a logo watermark, then prepend an intro and append an outro
 * sting. Each step is independent and skipped when its asset is missing. No-ops (returns
 * `applied:false`) without ffmpeg so the pipeline still completes offline. Edits `videoPath`
 * in place by swapping in the processed file.
 */
export async function applyBranding(
  videoPath: string,
  branding: Branding | undefined,
  log: (level: "debug" | "info" | "warn" | "error", msg: string, extra?: Record<string, unknown>) => void,
): Promise<BrandingResult> {
  const steps: string[] = [];
  if (!brandingActive(branding) || !branding) return { applied: false, steps };
  if (!(await hasFfmpeg())) {
    log("warn", "branding skipped: ffmpeg unavailable");
    return { applied: false, steps };
  }

  const dir = dirname(videoPath);
  let current = videoPath;
  let stamp = 0;
  const next = () => join(dir, `branded-${stamp++}.mp4`);

  // 1) Watermark overlay.
  const wm = branding.watermark;
  if (wm?.enabled && (await exists(wm.path))) {
    const out = next();
    try {
      await pexec(
        `ffmpeg -y -i "${current}" -i "${wm.path}" ` +
          `-filter_complex "${watermarkFilter(wm.position, wm.scale, wm.opacity, wm.margin)}" ` +
          `-map "[v]" -map 0:a? -c:v libx264 -pix_fmt yuv420p -c:a copy "${out}"`,
      );
      current = out;
      steps.push("watermark");
    } catch (err) {
      log("warn", "watermark overlay failed", { error: (err as Error).message });
    }
  }

  // 2) Intro/outro concat (re-encode each to a uniform format, then concat by stream copy).
  const stings = [branding.intro, current, branding.outro].filter(Boolean) as string[];
  if (stings.length > 1 && (branding.intro || branding.outro)) {
    try {
      const reso = await probeSize(current);
      const normalized: string[] = [];
      for (let i = 0; i < stings.length; i++) {
        const norm = join(dir, `sting-${i}.mp4`);
        await pexec(
          `ffmpeg -y -i "${stings[i]}" -vf "scale=${reso.w}:${reso.h}:force_original_aspect_ratio=decrease,` +
            `pad=${reso.w}:${reso.h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30" ` +
            `-ar 48000 -ac 2 -c:v libx264 -pix_fmt yuv420p -c:a aac "${norm}"`,
        );
        normalized.push(norm);
      }
      const listFile = join(dir, "branding-list.txt");
      const { writeFile } = await import("node:fs/promises");
      await writeFile(listFile, normalized.map((p) => `file '${p}'`).join("\n"));
      const out = next();
      await pexec(`ffmpeg -y -f concat -safe 0 -i "${listFile}" -c copy "${out}"`);
      current = out;
      if (branding.intro) steps.push("intro");
      if (branding.outro) steps.push("outro");
    } catch (err) {
      log("warn", "intro/outro concat failed", { error: (err as Error).message });
    }
  }

  if (current !== videoPath) {
    await rename(current, videoPath);
    log("info", "branding applied", { steps });
    return { applied: true, steps };
  }
  return { applied: false, steps };
}

async function probeSize(path: string): Promise<{ w: number; h: number }> {
  try {
    const { stdout } = await pexec(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x "${path}"`,
    );
    const [w, h] = stdout.trim().split("x").map((n) => Number.parseInt(n, 10));
    if (w && h) return { w, h };
  } catch {
    /* fall through */
  }
  return { w: 1080, h: 1920 };
}
