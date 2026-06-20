import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Stage } from "../../core/pipeline/stage.js";
import type { CaptionAsset } from "../../core/types/index.js";
import { runDir } from "../../storage/paths.js";
import { buildCues, toSrt } from "./srt.js";
import { transcribeToCues } from "./align.js";

/**
 * Stage 4b — Captions. Generates an .srt per format from the narration, timed to the
 * audio. Sidecar by default (uploaded as a subtitle track / used by the assisted copy);
 * optionally burned into the video in the render stage. Skipped if disabled.
 */
export function createCaptionsStage(): Stage {
  return {
    name: "captions",
    async run(ctx) {
      if (!ctx.channel.render.captions.enabled) {
        ctx.log("info", "captions disabled; skipping");
        return;
      }
      if (!ctx.scripts || !ctx.audio) throw new Error("captions: missing scripts/audio");
      const dir = join(runDir(ctx.channel.id, ctx.date), "captions");
      await mkdir(dir, { recursive: true });
      const maxChars = ctx.channel.render.captions.max_chars_per_line;

      const wantWhisper = ctx.channel.render.captions.align === "whisper";
      const captions: CaptionAsset[] = [];
      for (const script of ctx.scripts) {
        const audio = ctx.audio.find((a) => a.format === script.format);
        if (!audio) continue;
        let cues = null as ReturnType<typeof buildCues> | null;
        if (wantWhisper) {
          try {
            cues = await transcribeToCues(audio.path);
            ctx.log("info", `captions aligned via whisper (${script.format})`, { cues: cues.length });
          } catch (err) {
            ctx.log("warn", `whisper align failed (${script.format}); using proportional`, { error: (err as Error).message });
          }
        }
        if (!cues) cues = buildCues(script.narration, audio.durationSec, maxChars);
        const path = join(dir, `${script.format}.srt`);
        await writeFile(path, toSrt(cues), "utf8");
        captions.push({ format: script.format, path, cueCount: cues.length });
      }
      ctx.captions = captions;
      ctx.log("info", "captions built", { tracks: captions.length });
    },
  };
}
