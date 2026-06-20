import type { Stage } from "../../core/pipeline/stage.js";
import type { NicheAdapter } from "../../adapters/_interface.js";

/**
 * Stage 1 — Ingest. Runs the freshness gate (adapter.isReady) and, if ready,
 * pulls raw data via adapter.fetch. Skips the whole run cleanly when no fresh data.
 */
export function createIngestStage(adapter: NicheAdapter): Stage {
  return {
    name: "ingest",
    async shouldRun(ctx) {
      const r = await adapter.isReady(ctx);
      return { run: r.ready, reason: r.reason };
    },
    async run(ctx) {
      ctx.raw = await adapter.fetch(ctx);
    },
  };
}
