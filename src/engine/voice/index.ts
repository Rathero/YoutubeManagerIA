import { join } from "node:path";
import type { Stage } from "../../core/pipeline/stage.js";
import type { AudioAsset } from "../../core/types/index.js";
import { runDir } from "../../storage/paths.js";
import { getTtsProvider, hashText } from "./provider.js";

/**
 * Stage 4 — Voice. One audio track per format. Cache key = hash of narration text,
 * so re-running a day with unchanged scripts doesn't re-synthesize. Provider is
 * swappable (ElevenLabs/OpenAI/Google/stub) and falls back to stub without keys.
 */
export function createVoiceStage(): Stage {
  return {
    name: "voice",
    async run(ctx) {
      if (!ctx.scripts) throw new Error("voice: no scripts");
      const { provider, fellBack } = getTtsProvider(ctx.channel.voice);
      if (fellBack) {
        ctx.log("warn", `voice provider "${ctx.channel.voice.provider}" unavailable; using stub`);
      }
      const dir = join(runDir(ctx.channel.id, ctx.date), "audio");

      const audio: AudioAsset[] = [];
      for (const script of ctx.scripts) {
        const textHash = hashText(script.narration);
        const outPath = join(dir, `${script.format}-${textHash}.audio`);
        const res = await provider.synthesize({ text: script.narration, outPath });
        audio.push({
          format: script.format,
          path: res.path,
          durationSec: res.durationSec,
          loudnessLufs: provider.name === "stub" ? -14 : undefined,
          textHash: res.textHash,
        });
      }
      ctx.audio = audio;
      ctx.log("info", "voice synthesized", { tracks: audio.length, provider: provider.name });
    },
  };
}
