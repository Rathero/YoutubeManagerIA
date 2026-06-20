import type { PublishResult } from "../core/types/index.js";

/**
 * Analytics & feedback loop (section 10). Interfaces only for the MVP — implementations
 * (YouTube Analytics API pull, attribution, prompt feedback) plug in behind these.
 */
export interface MetricPoint {
  publicationId: string;
  platform: string;
  views: number;
  retentionPct?: number;
  likes?: number;
  subs?: number;
  clicks?: number;
  capturedAt: string;
}

export interface MetricsSource {
  readonly platform: string;
  pull(externalId: string): Promise<MetricPoint | null>;
}

export interface FeedbackSignal {
  /** e.g. "publish_time", "hook_style", "format", "thumbnail". */
  variable: string;
  /** suggested change, human-readable. */
  recommendation: string;
  confidence: number;
}

/**
 * Given recent metrics, derive actionable feedback. Stub: returns no signals until
 * enough data is collected. The real version correlates KPIs against controllable
 * variables (publish time, hook, format) and feeds the script prompt + scheduling.
 */
export function deriveFeedback(_metrics: MetricPoint[]): FeedbackSignal[] {
  return [];
}

/** Summarize a run's publish results into a one-line operator status. */
export function summarizePublications(results: PublishResult[]): string {
  const by = (s: string) => results.filter((r) => r.status === s).length;
  return `published=${by("published")} queued=${by("queued_assisted")} skipped=${by("skipped")} failed=${by("failed")}`;
}
