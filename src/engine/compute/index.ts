import type { Stage } from "../../core/pipeline/stage.js";
import type { NicheAdapter } from "../../adapters/_interface.js";
import { ContentPayloadSchema } from "../../core/types/index.js";

/**
 * Stage 2 — Compute. Runs the adapter's deterministic analyze() and validates the
 * resulting ContentPayload against the schema (the agnostic contract boundary).
 */
export function createComputeStage(adapter: NicheAdapter): Stage {
  return {
    name: "compute",
    async run(ctx) {
      if (ctx.raw === undefined) throw new Error("compute: no raw data (ingest did not run)");
      const payload = await adapter.analyze(ctx.raw, ctx);
      // Hard contract check: the engine refuses to proceed on a malformed payload.
      ctx.payload = ContentPayloadSchema.parse(payload);
      ctx.log("info", "payload computed", {
        classification: ctx.payload.classification,
        metrics: ctx.payload.keyMetrics.length,
      });
    },
  };
}
