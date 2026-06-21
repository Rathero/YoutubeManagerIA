import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Stage } from "../../core/pipeline/stage.js";
import type { AudioAsset } from "../../core/types/index.js";
import { dbDir } from "../../storage/paths.js";
import { mapLimit } from "../../core/util/concurrency.js";
import { getTtsProvider, hashText, StubTtsProvider, type TtsProvider } from "./provider.js";

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Stage 4 — Voice. One audio track per format, synthesized in parallel. Uses a GLOBAL
 * cache keyed by provider+voice+narration hash (out/_db/cache/voice): identical narration
 * — across re-runs OR channels — is never re-synthesized. Provider is swappable and falls
 * back to the stub without keys / on failure.
 */
export function createVoiceStage(): Stage {
  return {
    name: "voice",
    async run(ctx) {
      if (!ctx.scripts) throw new Error("voice: no scripts");
      const { provider, fellBack } = getTtsProvider(ctx.channel.voice);
      if (fellBack) ctx.log("warn", `voice provider "${ctx.channel.voice.provider}" unavailable; using stub`);
      const cacheDir = join(dbDir(), "cache", "voice");
      await mkdir(cacheDir, { recursive: true });
      const voiceKey = `${provider.name}-${ctx.channel.voice.voice_id ?? "def"}`;
      const stub = new StubTtsProvider(ctx.channel.voice.speed);

      let hits = 0;
      const audio: AudioAsset[] = await mapLimit(ctx.scripts, 3, async (script) => {
        const textHash = hashText(script.narration);
        const base = join(cacheDir, `${voiceKey}-${textHash}`);
        const metaFile = `${base}.meta.json`;

        // Global cache hit → reuse without calling the provider.
        if (await exists(metaFile)) {
          const meta = JSON.parse(await readFile(metaFile, "utf8")) as { path: string; durationSec: number; stub: boolean };
          hits++;
          return { format: script.format, path: meta.path, durationSec: meta.durationSec, loudnessLufs: meta.stub ? -14 : undefined, textHash };
        }

        let res;
        let usedStub = provider.name === "stub";
        try {
          res = await (provider as TtsProvider).synthesize({ text: script.narration, outPath: `${base}.audio` });
        } catch (err) {
          ctx.log("warn", `voice provider "${provider.name}" failed; using stub`, { error: (err as Error).message });
          res = await stub.synthesize({ text: script.narration, outPath: `${base}.audio` });
          usedStub = true;
        }
        await writeFile(metaFile, JSON.stringify({ path: res.path, durationSec: res.durationSec, stub: usedStub }));
        return { format: script.format, path: res.path, durationSec: res.durationSec, loudnessLufs: usedStub ? -14 : undefined, textHash };
      });

      ctx.audio = audio;
      ctx.log("info", "voice synthesized", { tracks: audio.length, provider: provider.name, cacheHits: hits });
    },
  };
}
