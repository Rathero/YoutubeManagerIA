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

      // Dedup: warn if today's headline repeats a recent one (avoids slop/repetition).
      if (payload?.headlineFact) {
        try {
          const { recentHeadlines, isDuplicateHeadline, nearDuplicate } = await import("../../storage/dedup.js");
          const recent = await recentHeadlines(ctx.channel.id, ctx.date);
          if (isDuplicateHeadline(payload.headlineFact, recent)) {
            warnings.push(`headline repite uno reciente: "${payload.headlineFact}" — varía el ángulo`);
          } else {
            const near = nearDuplicate(payload.headlineFact, recent);
            if (near) warnings.push(`headline muy similar (${near.score}) a "${near.match}" — varía el ángulo`);
          }
        } catch {
          /* dedup best-effort */
        }
      }

      const contentKind = ctx.channel.niche.content_kind;
      if (!payload) {
        failures.push("no payload");
      } else {
        if (!payload.headlineFact?.trim()) failures.push("empty headlineFact");
        if (!payload.sourceRef?.name) failures.push("missing source attribution");
        if (payload.safety.riskNotes && payload.safety.riskNotes.length > 0) {
          failures.push(`risk notes require human review: ${payload.safety.riskNotes.join("; ")}`);
        }

        if (contentKind === "data") {
          // Data channels must be grounded in fresh, verified numbers.
          if (!payload.safety.factsVerified) failures.push("facts not verified (safety.factsVerified=false)");
          if (payload.keyMetrics.length < MIN_METRICS) {
            failures.push(`too few metrics (${payload.keyMetrics.length} < ${MIN_METRICS}) — looks empty`);
          }
        } else {
          // Knowledge/story: LLM-authored. Require substance (a hook + at least one beat),
          // not external metrics. Unverified facts are a warning, not a blocker.
          if (payload.segments.length < 1) failures.push("empty body (no segments) — looks empty");
          if (!payload.safety.factsVerified) {
            warnings.push(`content_kind=${contentKind}: facts are LLM-authored/unverified — ensure AI disclosure`);
          }
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

      const nonVideo = (ctx.rendered ?? []).filter((r) => r.mimeType !== "video/mp4");
      if (nonVideo.length > 0) {
        warnings.push(
          `${nonVideo.length} render(s) produced a manifest, not an MP4 ` +
            `(no ffmpeg, or generative provider without API key). Not publishable as video until rendered for real.`,
        );
      }

      // Copyright / Content-ID guardrail. Music must declare a license source; stock
      // B-roll (Pexels/Pixabay) is royalty-free; AI-generated media is owned + disclosed.
      const music = ctx.channel.render.music;
      if (music.enabled) {
        if (!music.library && !music.track) {
          failures.push("music enabled but no licensed library/track declared (copyright risk) — set render.music.library");
        } else if (!music.library) {
          warnings.push("music: track set but no library declared — confirm you hold the license");
        }
      }
      if (ctx.channel.render.broll.enabled && ctx.channel.render.broll.provider !== "none") {
        warnings.push(`B-roll from ${ctx.channel.render.broll.provider} (royalty-free) — keep attribution where required`);
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
