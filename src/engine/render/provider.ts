import { exec } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";
import type { ChannelDefinition, ContentPayload, FormatScript } from "../../core/types/index.js";

const pexec = promisify(exec);

export interface RenderRequest {
  channel: ChannelDefinition;
  payload: ContentPayload;
  script: FormatScript;
  audioPath: string;
  durationSec: number;
  aspectRatio: string; // "9:16" | "16:9" | "1:1"
  outPath: string; // .mp4
  /** Optional .srt to burn into the video (when render.captions.burn_in). */
  captionsPath?: string;
  /** Optional stock B-roll clip used as the background instead of a solid color. */
  brollPath?: string;
}

export interface RenderResult {
  path: string;
  mimeType: string;
  durationSec: number;
}

export interface RenderEngine {
  readonly name: string;
  render(req: RenderRequest): Promise<RenderResult>;
}

function dimensions(aspect: string): { w: number; h: number } {
  switch (aspect) {
    case "9:16":
      return { w: 1080, h: 1920 };
    case "1:1":
      return { w: 1080, h: 1080 };
    case "4:5":
      return { w: 1080, h: 1350 };
    case "16:9":
    default:
      return { w: 1920, h: 1080 };
  }
}

async function hasFfmpeg(): Promise<boolean> {
  try {
    await pexec("ffmpeg -version");
    return true;
  } catch {
    return false;
  }
}

function esc(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "’").slice(0, 120);
}

/**
 * FFmpeg render engine. Produces a real MP4: a brand-colored card with the headline
 * fact, muxed with the narration audio, sized to the requested aspect ratio. This is
 * the M1 "fast" path; M2 swaps in Remotion behind the same RenderEngine interface.
 */
export class FfmpegRenderEngine implements RenderEngine {
  readonly name = "ffmpeg";
  async render(req: RenderRequest): Promise<RenderResult> {
    const { w, h } = dimensions(req.aspectRatio);
    const palette = req.channel.identity.brand.palette;
    const bg = (palette.bg ?? "#0b1220").replace("#", "0x");
    const fg = (palette.fg ?? "#ffffff").replace("#", "0x");
    const headline = esc(req.payload.headlineFact);
    await mkdir(dirname(req.outPath), { recursive: true });

    const dur = Math.max(1, req.durationSec);
    const subs = req.captionsPath ? `,subtitles='${req.captionsPath.replace(/'/g, "\\'")}'` : "";
    const text = `drawtext=text='${headline}':fontcolor=${fg}:fontsize=${Math.round(w / 22)}:x=(w-text_w)/2:y=(h-text_h)/2:line_spacing=12`;
    const cmd = req.brollPath
      ? // B-roll background: loop the clip, scale/crop to fill, overlay the headline.
        `ffmpeg -y -stream_loop -1 -i "${req.brollPath}" -i "${req.audioPath}" ` +
        `-map 0:v:0 -map 1:a:0 -t ${dur} ` +
        `-vf "scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},${text}${subs}" ` +
        `-c:v libx264 -pix_fmt yuv420p -c:a aac -shortest "${req.outPath}"`
      : `ffmpeg -y -f lavfi -i color=c=${bg}:s=${w}x${h}:d=${dur} -i "${req.audioPath}" ` +
        `-vf "${text}${subs}" -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest "${req.outPath}"`;
    await pexec(cmd);
    return { path: req.outPath, mimeType: "video/mp4", durationSec: dur };
  }
}

/**
 * Manifest fallback — when ffmpeg isn't installed. Emits a JSON description of the
 * video (scenes, brand, data) so the pipeline still completes and is inspectable.
 */
export class ManifestRenderEngine implements RenderEngine {
  readonly name = "manifest";
  async render(req: RenderRequest): Promise<RenderResult> {
    const { w, h } = dimensions(req.aspectRatio);
    const manifest = {
      kind: "render-manifest",
      template: req.channel.render.template,
      brand: req.channel.identity.brand,
      aspectRatio: req.aspectRatio,
      dimensions: { w, h },
      durationSec: req.durationSec,
      audioPath: req.audioPath,
      scenes: Object.entries(req.script.sections).map(([key, text]) => ({ key, text })),
      headlineFact: req.payload.headlineFact,
      keyMetrics: req.payload.keyMetrics,
      visualData: req.payload.visualData,
    };
    const outPath = req.outPath.replace(/\.mp4$/, ".manifest.json");
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, JSON.stringify(manifest, null, 2));
    return { path: outPath, mimeType: "application/json", durationSec: req.durationSec };
  }
}

/**
 * Remotion render engine. Renders a React composition via the Remotion CLI, passing the
 * payload + brand as input props. Activates only when FACTORY_REMOTION_ENTRY points at a
 * bundled Remotion project; otherwise the caller falls back to ffmpeg/manifest. This keeps
 * Remotion (and its heavy deps) optional while wiring the M2 path behind the same interface.
 */
export class RemotionRenderEngine implements RenderEngine {
  readonly name = "remotion";
  constructor(private entry: string) {}
  async render(req: RenderRequest): Promise<RenderResult> {
    const { w, h } = dimensions(req.aspectRatio);
    const comp = req.channel.render.template || "data-card-v1";
    const props = JSON.stringify({
      brand: req.channel.identity.brand,
      payload: req.payload,
      script: req.script.sections,
      aspectRatio: req.aspectRatio,
      width: w,
      height: h,
      audioPath: req.audioPath,
      durationSec: req.durationSec,
    });
    await mkdir(dirname(req.outPath), { recursive: true });
    const propsFile = req.outPath.replace(/\.mp4$/, ".props.json");
    await writeFile(propsFile, props);
    await pexec(
      `npx --yes remotion render "${this.entry}" "${comp}" "${req.outPath}" ` +
        `--props="${propsFile}" --width=${w} --height=${h}`,
    );
    return { path: req.outPath, mimeType: "video/mp4", durationSec: req.durationSec };
  }
}

export async function getRenderEngine(engine: string): Promise<RenderEngine> {
  const remotionEntry = process.env.FACTORY_REMOTION_ENTRY;
  if (engine === "remotion" && remotionEntry) return new RemotionRenderEngine(remotionEntry);
  // ffmpeg fast path (also the fallback for remotion when no project is configured).
  if ((engine === "ffmpeg" || engine === "remotion") && (await hasFfmpeg())) {
    return new FfmpegRenderEngine();
  }
  return new ManifestRenderEngine();
}
