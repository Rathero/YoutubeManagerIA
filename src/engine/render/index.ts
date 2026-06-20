import { join } from "node:path";
import type { Stage } from "../../core/pipeline/stage.js";
import type { RenderedAsset } from "../../core/types/index.js";
import { runDir } from "../../storage/paths.js";
import { getRenderEngine } from "./provider.js";

/** Map a format to the aspect ratios it should be rendered in. */
function aspectsForFormat(format: string, channelAspects: string[]): string[] {
  if (format === "short") return channelAspects.filter((a) => a === "9:16").length ? ["9:16"] : ["9:16"];
  if (format === "square") return ["1:1"];
  // long & weekly default to 16:9 (fallback to whatever the channel declares).
  return channelAspects.filter((a) => a === "16:9").length ? ["16:9"] : ["16:9"];
}

/**
 * Stage 6 — Render. One payload → many outputs. Renders each format into its target
 * aspect ratio(s), parametrized by brand. Engine is swappable (ffmpeg/remotion/manifest).
 */
export function createRenderStage(): Stage {
  return {
    name: "render",
    async run(ctx) {
      if (!ctx.scripts || !ctx.audio || !ctx.payload) throw new Error("render: missing inputs");
      const engine = await getRenderEngine(ctx.channel.render.engine);
      const dir = join(runDir(ctx.channel.id, ctx.date), "video");
      const channelAspects = ctx.channel.render.aspect_ratios;

      const rendered: RenderedAsset[] = [];
      for (const script of ctx.scripts) {
        const audio = ctx.audio.find((a) => a.format === script.format);
        if (!audio) throw new Error(`render: no audio for format ${script.format}`);
        for (const aspect of aspectsForFormat(script.format, channelAspects)) {
          const outPath = join(dir, `${script.format}-${aspect.replace(":", "x")}.mp4`);
          const res = await engine.render({
            channel: ctx.channel,
            payload: ctx.payload,
            script,
            audioPath: audio.path,
            durationSec: audio.durationSec,
            aspectRatio: aspect,
            outPath,
          });
          rendered.push({
            format: script.format,
            aspectRatio: aspect,
            path: res.path,
            durationSec: res.durationSec,
            mimeType: res.mimeType,
          });
        }
      }
      ctx.rendered = rendered;
      ctx.log("info", "render done", { engine: engine.name, assets: rendered.length });
    },
  };
}
