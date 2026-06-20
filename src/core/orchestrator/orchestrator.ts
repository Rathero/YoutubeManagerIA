import type { Stage } from "../pipeline/stage.js";
import type { RunContext, StageRecord } from "../types/run-context.js";

export type RunOutcome =
  | { status: "completed"; ctx: RunContext }
  | { status: "skipped"; stage: string; reason: string; ctx: RunContext }
  | { status: "failed"; stage: string; error: Error; ctx: RunContext };

/**
 * The orchestrator runs stages sequentially, threading a single RunContext.
 * It is intentionally dumb and generic: it never knows what a stage does, only
 * that stages run in order, can be skipped cleanly, and that any throw aborts the
 * whole run (we never publish a half-built ciclo).
 */
export class Orchestrator {
  constructor(private readonly stages: Stage[]) {}

  async run(ctx: RunContext): Promise<RunOutcome> {
    for (const stage of this.stages) {
      const startedAt = new Date();

      if (stage.shouldRun) {
        const decision = await stage.shouldRun(ctx);
        if (!decision.run) {
          this.record(ctx, stage.name, "skipped", startedAt, decision.reason);
          ctx.log("info", `stage ${stage.name} skipped`, { reason: decision.reason });
          return { status: "skipped", stage: stage.name, reason: decision.reason ?? "skipped", ctx };
        }
      }

      try {
        ctx.log("info", `stage ${stage.name} start`);
        await stage.run(ctx);
        this.record(ctx, stage.name, "ok", startedAt);
        ctx.log("info", `stage ${stage.name} ok`);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.record(ctx, stage.name, "failed", startedAt, error.message);
        ctx.log("error", `stage ${stage.name} failed`, { error: error.message });
        return { status: "failed", stage: stage.name, error, ctx };
      }
    }
    return { status: "completed", ctx };
  }

  private record(
    ctx: RunContext,
    stage: StageRecord["stage"],
    status: StageRecord["status"],
    startedAt: Date,
    message?: string,
  ): void {
    const endedAt = new Date();
    ctx.stageRecords.push({
      stage,
      status,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      durationMs: endedAt.getTime() - startedAt.getTime(),
      message,
    });
  }
}
