import type { Stage } from "../../core/pipeline/stage.js";
import { toRunRecord, type Store } from "../../storage/store.js";

/**
 * Stage 10 — Record. Persists the payload and the run record for reproducibility
 * and analytics. (status is finalized by the caller; here we snapshot a completed run.)
 */
export function createRecordStage(store: Store): Stage {
  return {
    name: "record",
    async run(ctx) {
      if (ctx.payload) await store.savePayload(ctx.channel.id, ctx.date, ctx.payload);
      await store.saveRun(toRunRecord(ctx, "completed"));
      ctx.log("info", "run recorded", { runId: ctx.runId });
    },
  };
}
