import { exec } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Stage } from "../../core/pipeline/stage.js";
import type { FormatKind, ThumbnailAsset } from "../../core/types/index.js";
import { runDir } from "../../storage/paths.js";
import { getImageProvider } from "../image/provider.js";

const pexec = promisify(exec);

async function hasFfmpeg(): Promise<boolean> {
  try {
    await pexec("ffmpeg -version");
    return true;
  } catch {
    return false;
  }
}

function dims(format: FormatKind): { w: number; h: number } {
  if (format === "short") return { w: 1080, h: 1920 };
  if (format === "square") return { w: 1080, h: 1080 };
  return { w: 1280, h: 720 };
}

function esc(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "’").slice(0, 90);
}

function dayIndex(date: string): number {
  const t = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(t) ? Math.floor(t / 86400000) : 0;
}

/** Brand data-card thumbnail. Variant "B" uses a top banner + top-aligned text. */
async function ffmpegThumb(headline: string, w: number, h: number, bg: string, fg: string, accent: string, outPath: string, variant: string): Promise<void> {
  const bannerY = variant === "B" ? Math.round(h * 0.1) : Math.round(h * 0.72);
  const textY = variant === "B" ? Math.round(h * 0.18) : "(h-text_h)/2";
  const cmd =
    `ffmpeg -y -f lavfi -i color=c=${bg}:s=${w}x${h} -frames:v 1 ` +
    `-vf "drawbox=x=0:y=${bannerY}:w=${w}:h=10:color=${accent}:t=fill,` +
    `drawtext=text='${esc(headline)}':fontcolor=${fg}:fontsize=${Math.round(w / 15)}:` +
    `x=(w-text_w)/2:y=${textY}:line_spacing=14" "${outPath}"`;
  await pexec(cmd);
}

/**
 * Stage 6b — Thumbnail. One thumbnail per video format. Uses the configured AI image
 * provider when available (a poster-style still), otherwise a brand data-card via
 * ffmpeg, otherwise a manifest. Surfaced to YouTube metadata + the assisted bundle.
 */
export function createThumbnailStage(): Stage {
  return {
    name: "thumbnail",
    async run(ctx) {
      if (!ctx.channel.render.thumbnails.enabled) {
        ctx.log("info", "thumbnails disabled; skipping");
        return;
      }
      if (!ctx.payload || !ctx.scripts) throw new Error("thumbnail: missing inputs");
      const dir = join(runDir(ctx.channel.id, ctx.date), "thumbnails");
      await mkdir(dir, { recursive: true });
      const palette = ctx.channel.identity.brand.palette;
      const bg = (palette.bg ?? "#0b1220").replace("#", "0x");
      const fg = (palette.fg ?? "#ffffff").replace("#", "0x");
      const accent = (palette.accent ?? palette.expensive ?? "#3b82f6").replace("#", "0x");
      const ffmpeg = await hasFfmpeg();

      // AI image provider only if explicitly configured (avoid surprise cost).
      const imageCfg = ctx.channel.image;
      const aiImage = imageCfg ? getImageProvider(imageCfg) : null;
      const useAi = Boolean(aiImage && !aiImage.fellBack);

      // A/B: rotate thumbnail layout by date when enabled (attributed via feedback).
      const variant = ctx.channel.ab_testing.thumbnails ? (dayIndex(ctx.date) % 2 === 0 ? "A" : "B") : "A";

      const thumbs: ThumbnailAsset[] = [];
      const formats = [...new Set(ctx.scripts.map((s) => s.format))];
      for (const format of formats) {
        const { w, h } = dims(format);
        const outPath = join(dir, `${format}.png`);
        try {
          if (useAi) {
            const lens = variant === "B" ? "cinematic close-up, dramatic" : "wide, bold, high contrast";
            const prompt = `Eye-catching YouTube thumbnail poster about: ${ctx.payload.headlineFact}. ${lens}, no text.`;
            const res = await aiImage!.provider.generateImage({ prompt, width: w, height: h, outPath });
            thumbs.push({ format, path: res.path, mimeType: res.mimeType, variant });
            continue;
          }
          if (ffmpeg) {
            await ffmpegThumb(ctx.payload.headlineFact, w, h, bg, fg, accent, outPath, variant);
            thumbs.push({ format, path: outPath, mimeType: "image/png", variant });
            continue;
          }
        } catch (err) {
          ctx.log("warn", `thumbnail generation failed for ${format}; writing manifest`, { error: (err as Error).message });
        }
        const manifest = outPath.replace(/\.png$/, ".thumb.json");
        await writeFile(manifest, JSON.stringify({ kind: "thumbnail-manifest", format, variant, headline: ctx.payload.headlineFact, size: { w, h } }, null, 2));
        thumbs.push({ format, path: manifest, mimeType: "application/json", variant });
      }
      ctx.thumbnails = thumbs;
      ctx.log("info", "thumbnails built", { count: thumbs.length, ai: useAi, variant });
    },
  };
}
