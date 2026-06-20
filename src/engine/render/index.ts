import { join } from "node:path";
import type { Stage } from "../../core/pipeline/stage.js";
import type { RenderedAsset } from "../../core/types/index.js";
import { runDir } from "../../storage/paths.js";
import type { LlmClient } from "../llm/client.js";
import { getRenderEngine } from "./provider.js";
import { renderGenerative } from "./generative.js";
import { mixMusicInto } from "./music.js";

/** Map a format to the aspect ratios it should be rendered in. */
function aspectsForFormat(format: string, channelAspects: string[]): string[] {
  if (format === "short") return ["9:16"];
  if (format === "square") return ["1:1"];
  return channelAspects.includes("16:9") ? ["16:9"] : ["16:9"];
}

function isGenerative(channel: { render: { engine: string }; video?: { mode: string } }): boolean {
  return (
    channel.render.engine === "generative" ||
    channel.video?.mode === "generative" ||
    channel.video?.mode === "images"
  );
}

/**
 * Stage 6 — Render. One payload → many outputs. Two paths behind one stage:
 *  - data_card: brand-colored data graphics (ffmpeg / remotion / manifest)
 *  - generative: AI-generated footage (Veo/Sora/Runway) stitched with narration
 * Engine and provider are swappable; both fall back gracefully when tools/keys are absent.
 */
export function createRenderStage(llm: LlmClient | null): Stage {
  return {
    name: "render",
    async run(ctx) {
      if (!ctx.scripts || !ctx.audio || !ctx.payload) throw new Error("render: missing inputs");
      const dir = join(runDir(ctx.channel.id, ctx.date), "video");
      const channelAspects = ctx.channel.render.aspect_ratios;
      const generative = isGenerative(ctx.channel) && Boolean(ctx.channel.video);
      const engine = generative ? null : await getRenderEngine(ctx.channel.render.engine);

      const rendered: RenderedAsset[] = [];
      for (const script of ctx.scripts) {
        const audio = ctx.audio.find((a) => a.format === script.format);
        if (!audio) throw new Error(`render: no audio for format ${script.format}`);
        for (const aspect of aspectsForFormat(script.format, channelAspects)) {
          const outPath = join(dir, `${script.format}-${aspect.replace(":", "x")}.mp4`);
          if (generative) {
            rendered.push(
              await renderGenerative({
                channel: ctx.channel,
                payload: ctx.payload,
                script,
                audio,
                aspectRatio: aspect,
                outPath,
                llm,
                log: ctx.log,
              }),
            );
            continue;
          }
          const burnIn = ctx.channel.render.captions.enabled && ctx.channel.render.captions.burn_in;
          const captionsPath = burnIn ? ctx.captions?.find((c) => c.format === script.format)?.path : undefined;
          const res = await engine!.render({
            channel: ctx.channel,
            payload: ctx.payload,
            script,
            audioPath: audio.path,
            durationSec: audio.durationSec,
            aspectRatio: aspect,
            outPath,
            captionsPath,
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
      // Background music (post-pass; no-op without ffmpeg/track).
      const music = ctx.channel.render.music;
      if (music.enabled && music.track) {
        for (const asset of rendered) {
          if (asset.mimeType !== "video/mp4") continue;
          const mixed = await mixMusicInto(asset.path, music.track, music.volume_db);
          if (mixed) ctx.log("info", "music mixed", { format: asset.format });
        }
      }

      ctx.rendered = rendered;
      ctx.log("info", "render done", { mode: generative ? "generative" : "data_card", assets: rendered.length });
    },
  };
}
