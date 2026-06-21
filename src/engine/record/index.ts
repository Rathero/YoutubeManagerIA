import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Stage } from "../../core/pipeline/stage.js";
import { dbDir } from "../../storage/paths.js";
import { toRunRecord, type Store } from "../../storage/store.js";

/**
 * Stage 10 — Record. Persists the payload, the scripts, and the run record for
 * reproducibility, the content library and the UI preview.
 */
export function createRecordStage(store: Store): Stage {
  return {
    name: "record",
    async run(ctx) {
      if (ctx.payload) await store.savePayload(ctx.channel.id, ctx.date, ctx.payload);
      if (ctx.scripts) {
        const dir = join(dbDir(), "scripts");
        await mkdir(dir, { recursive: true });
        await writeFile(join(dir, `${ctx.channel.id}_${ctx.date}.json`), JSON.stringify(ctx.scripts, null, 2));
      }
      await store.saveRun(toRunRecord(ctx, "completed"));
      // Archive this run's media as a promotable version.
      if (ctx.rendered?.length) {
        const { archiveVersion } = await import("../../storage/versions.js");
        await archiveVersion(ctx.channel.id, ctx.date, ctx.runId, ctx.rendered, ctx.thumbnails ?? [], {
          headline: ctx.payload?.headlineFact,
          style: ctx.channel.video?.style,
        }).catch((e) => ctx.log("warn", "version archive failed", { error: (e as Error).message }));
      }
      ctx.log("info", "run recorded", { runId: ctx.runId });
    },
  };
}
