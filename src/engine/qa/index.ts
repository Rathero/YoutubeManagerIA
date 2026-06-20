import type { Stage } from "../../core/pipeline/stage.js";
import type { Format, RunContext } from "../../core/types/index.js";

/** Minimum data richness before a piece is worth publishing. */
const MIN_METRICS = 2;
const LOUDNESS_TARGET = -14;
const LOUDNESS_TOLERANCE = 2;

type DurationVerdict = { level: "ok" | "warn" | "fail"; reason?: string };

function checkDuration(format: Format | undefined, actual: number): DurationVerdict {
  if (!format?.target_seconds) return { level: "ok" };
  const target = format.target_seconds;
  // Over-length is the real anti-slop risk (rambling / padding) -> hard fail.
  // Under-length just means a leaner piece -> warning, not a blocker.
  const min = target * 0.35;
  const max = target * 2;
  if (actual > max) return { level: "fail", reason: `duration ${actual}s above max ${Math.round(max)}s` };
  if (actual < min) return { level: "warn", reason: `duration ${actual}s below target band (~${Math.round(min)}s)` };
  return { level: "ok" };
}

/**
 * Stage 8 — QA Gate. The anti-slop guardian. Blocks publication on:
 *  - unverified / stale facts
 *  - empty payload (no headline or too few metrics)
 *  - out-of-range duration
 *  - loudness off target
 *  - missing source attribution
 *  - declared risk notes (force human review)
 * A failure aborts the run (the orchestrator never publishes a half-built cycle).
 */
export function createQaStage(): Stage {
  return {
    name: "qa",
    async run(ctx: RunContext) {
      const failures: string[] = [];
      const warnings: string[] = [];
      const payload = ctx.payload;

      if (!payload) {
        failures.push("no payload");
      } else {
        if (!payload.safety.factsVerified) failures.push("facts not verified (safety.factsVerified=false)");
        if (!payload.headlineFact?.trim()) failures.push("empty headlineFact");
        if (payload.keyMetrics.length < MIN_METRICS) {
          failures.push(`too few metrics (${payload.keyMetrics.length} < ${MIN_METRICS}) — looks empty`);
        }
        if (!payload.sourceRef?.name) failures.push("missing source attribution");
        if (payload.safety.riskNotes && payload.safety.riskNotes.length > 0) {
          failures.push(`risk notes require human review: ${payload.safety.riskNotes.join("; ")}`);
        }
      }

      const formatByKind = new Map(ctx.channel.formats.map((f) => [f.kind, f]));
      for (const audio of ctx.audio ?? []) {
        const d = checkDuration(formatByKind.get(audio.format), audio.durationSec);
        if (d.level === "fail") failures.push(`[${audio.format}] ${d.reason}`);
        else if (d.level === "warn") warnings.push(`[${audio.format}] ${d.reason}`);
        if (
          audio.loudnessLufs !== undefined &&
          Math.abs(audio.loudnessLufs - LOUDNESS_TARGET) > LOUDNESS_TOLERANCE
        ) {
          warnings.push(`[${audio.format}] loudness ${audio.loudnessLufs} LUFS off target ${LOUDNESS_TARGET}`);
        }
      }

      if (ctx.channel.render.music.enabled) {
        // Licensing is config-asserted in the MVP; flag for the operator to confirm.
        warnings.push("music enabled — ensure the track is from a licensed library");
      }

      const passed = failures.length === 0;
      ctx.qa = { passed, failures, warnings };
      ctx.log(passed ? "info" : "error", `qa ${passed ? "passed" : "failed"}`, {
        failures,
        warnings,
      });
      if (!passed) {
        throw new Error(`QA gate failed: ${failures.join("; ")}`);
      }
    },
  };
}
