import type { PublicationMetric } from "./index.js";

export interface Series {
  label: string;
  value: number;
  /** Optional secondary measure (e.g. sample size) for tooltips. */
  n?: number;
}

export interface AnalyticsSummary {
  totals: { publications: number; views: number; subs: number; avgRetentionPct: number };
  viewsByDate: Series[];
  viewsByHour: Series[];
  viewsByFormat: Series[];
  viewsByTitleVariant: Series[];
  viewsByThumbVariant: Series[];
  best: { hour?: number; format?: string; date?: string };
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

function sum(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0);
}

function groupSum<T>(items: T[], key: (t: T) => string | undefined, val: (t: T) => number): Map<string, { sum: number; n: number }> {
  const m = new Map<string, { sum: number; n: number }>();
  for (const it of items) {
    const k = key(it);
    if (k === undefined) continue;
    const cur = m.get(k) ?? { sum: 0, n: 0 };
    cur.sum += val(it);
    cur.n += 1;
    m.set(k, cur);
  }
  return m;
}

/**
 * Aggregate raw publication metrics into chart-ready series for the dashboard. Pure and
 * deterministic so the UI can render trend/bar charts without any analytics engine on the
 * client. Returns empty series (not nulls) when there is no data.
 */
export function analyticsSummary(metrics: PublicationMetric[]): AnalyticsSummary {
  const byDate = groupSum(metrics, (m) => m.date, (m) => m.views);
  const byHour = groupSum(metrics, (m) => String(m.publishHour).padStart(2, "0"), (m) => m.views);
  const byFormat = groupSum(metrics, (m) => m.format, (m) => m.views);
  const byTitle = groupSum(metrics, (m) => m.titleVariant, (m) => m.views);
  const byThumb = groupSum(metrics, (m) => m.thumbnailVariant, (m) => m.views);

  const dateSeries = [...byDate.entries()]
    .map(([label, { sum: s, n }]) => ({ label, value: s, n }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const hourSeries = [...byHour.entries()]
    .map(([label, { sum: s, n }]) => ({ label: `${label}:00`, value: Math.round(s / n), n }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const formatSeries = [...byFormat.entries()]
    .map(([label, { sum: s, n }]) => ({ label, value: Math.round(s / n), n }))
    .sort((a, b) => b.value - a.value);

  const bestHour = [...byHour.entries()].sort((a, b) => b[1].sum / b[1].n - a[1].sum / a[1].n)[0];
  const bestFormat = formatSeries[0];
  const bestDate = [...dateSeries].sort((a, b) => b.value - a.value)[0];

  const retentions = metrics.map((m) => m.retentionPct).filter((r): r is number => typeof r === "number");

  return {
    totals: {
      publications: metrics.length,
      views: sum(metrics.map((m) => m.views)),
      subs: sum(metrics.map((m) => m.subs ?? 0)),
      avgRetentionPct: Math.round(mean(retentions) * 10) / 10,
    },
    viewsByDate: dateSeries,
    viewsByHour: hourSeries,
    viewsByFormat: formatSeries,
    viewsByTitleVariant: [...byTitle.entries()].map(([label, { sum: s, n }]) => ({ label, value: Math.round(s / n), n })),
    viewsByThumbVariant: [...byThumb.entries()].map(([label, { sum: s, n }]) => ({ label, value: Math.round(s / n), n })),
    best: {
      hour: bestHour ? Number.parseInt(bestHour[0], 10) : undefined,
      format: bestFormat?.label,
      date: bestDate?.label,
    },
  };
}
