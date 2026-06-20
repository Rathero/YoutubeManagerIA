import type { RunContext, StageName } from "../types/run-context.js";

/**
 * A Stage is a single, named step of the Engine pipeline. Stages are generic:
 * they read/write the RunContext and know nothing about any specific niche.
 */
export interface Stage {
  name: StageName;
  /**
   * Optionally short-circuit the run without failing it (e.g. data not ready).
   * Returning { run: false } stops the pipeline cleanly (skipped, not failed).
   */
  shouldRun?(ctx: RunContext): Promise<{ run: boolean; reason?: string }>;
  run(ctx: RunContext): Promise<void>;
}
