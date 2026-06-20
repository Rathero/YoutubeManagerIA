import type { PublishResult } from "../core/types/index.js";

/**
 * Analytics & feedback loop (section 10). Pulls performance per publication and
 * correlates it with controllable variables (publish hour, format, hook/day type)
 * to produce actionable recommendations that feed scheduling + the script prompt.
 */
export interface PublicationMetric {
  channelId: string;
  date: string;
  platform: string;
  format: string;
  /** Controllable: the hour the piece was published (0..23). */
  publishHour: number;
  /** Controllable: the hook/day classification (e.g. "barato" | "caro"). */
  classification?: string;
  views: number;
  retentionPct?: number;
  subs?: number;
  clicks?: number;
}

export interface MetricsSource {
  readonly platform: string;
  /** Pull a single publication's metrics by external id; null if unavailable. */
  pull(externalId: string): Promise<Omit<PublicationMetric, "channelId" | "date" | "platform" | "format" | "publishHour"> | null>;
}

export interface FeedbackSignal {
  variable: "publish_time" | "format" | "hook_style";
  recommendation: string;
  /** 0..1; grows with sample size and effect size. */
  confidence: number;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    (m.get(k) ?? m.set(k, []).get(k)!).push(it);
  }
  return m;
}

/** Confidence heuristic: more samples + bigger lift over baseline → higher confidence. */
function confidence(sampleSize: number, lift: number): number {
  const sizeFactor = Math.min(1, sampleSize / 12);
  const liftFactor = Math.min(1, Math.abs(lift));
  return Math.round(sizeFactor * liftFactor * 100) / 100;
}

/**
 * Correlate metrics with controllable variables and surface the best-performing
 * publish hour, format, and hook style. Returns nothing until there is enough data.
 */
export function deriveFeedback(metrics: PublicationMetric[]): FeedbackSignal[] {
  const signals: FeedbackSignal[] = [];
  if (metrics.length < 6) return signals;

  const overallViews = mean(metrics.map((m) => m.views));
  if (overallViews <= 0) return signals;

  // 1) Best publish hour (by views).
  const byHour = groupBy(metrics, (m) => String(m.publishHour));
  let bestHour: { hour: string; avg: number; n: number } | null = null;
  for (const [hour, items] of byHour) {
    const avg = mean(items.map((m) => m.views));
    if (!bestHour || avg > bestHour.avg) bestHour = { hour, avg, n: items.length };
  }
  if (bestHour && byHour.size > 1) {
    const lift = (bestHour.avg - overallViews) / overallViews;
    if (lift > 0.1) {
      signals.push({
        variable: "publish_time",
        recommendation: `Publicar a las ${bestHour.hour}:00 rinde ~${Math.round(lift * 100)}% más vistas que la media. Ajustar publish_times.`,
        confidence: confidence(bestHour.n, lift),
      });
    }
  }

  // 2) Best format (by retention, falling back to views).
  const byFormat = groupBy(metrics, (m) => m.format);
  if (byFormat.size > 1) {
    let best: { format: string; score: number; n: number } | null = null;
    for (const [format, items] of byFormat) {
      const ret = items.map((m) => m.retentionPct ?? 0);
      const score = ret.some((r) => r > 0) ? mean(ret) : mean(items.map((m) => m.views));
      if (!best || score > best.score) best = { format, score, n: items.length };
    }
    if (best) {
      signals.push({
        variable: "format",
        recommendation: `El formato "${best.format}" es el que mejor retiene/rinde. Priorizar su cadencia.`,
        confidence: confidence(best.n, 0.5),
      });
    }
  }

  // 3) Best hook/day classification (by views).
  const byClass = groupBy(metrics.filter((m) => m.classification), (m) => m.classification!);
  if (byClass.size > 1) {
    let best: { cls: string; avg: number; n: number } | null = null;
    for (const [cls, items] of byClass) {
      const avg = mean(items.map((m) => m.views));
      if (!best || avg > best.avg) best = { cls, avg, n: items.length };
    }
    if (best) {
      const lift = (best.avg - overallViews) / overallViews;
      if (lift > 0.1) {
        signals.push({
          variable: "hook_style",
          recommendation: `Los días "${best.cls}" rinden ~${Math.round(lift * 100)}% más. Reforzar ese ángulo en el hook del guión.`,
          confidence: confidence(best.n, lift),
        });
      }
    }
  }

  return signals.sort((a, b) => b.confidence - a.confidence);
}

/** Summarize a run's publish results into a one-line operator status. */
export function summarizePublications(results: PublishResult[]): string {
  const by = (s: string) => results.filter((r) => r.status === s).length;
  return `published=${by("published")} queued=${by("queued_assisted")} skipped=${by("skipped")} failed=${by("failed")}`;
}
