import type { ChannelDefinition } from "../core/types/index.js";
import type { PublicationMetric } from "./index.js";

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

/** Best publish hour by views, if it clearly beats the average. */
function bestHour(metrics: PublicationMetric[]): { hour: number; lift: number } | null {
  if (metrics.length < 6) return null;
  const overall = mean(metrics.map((m) => m.views));
  if (overall <= 0) return null;
  const byHour = new Map<number, number[]>();
  for (const m of metrics) (byHour.get(m.publishHour) ?? byHour.set(m.publishHour, []).get(m.publishHour)!).push(m.views);
  if (byHour.size < 2) return null;
  let best: { hour: number; avg: number } | null = null;
  for (const [hour, vs] of byHour) {
    const avg = mean(vs);
    if (!best || avg > best.avg) best = { hour, avg };
  }
  if (!best) return null;
  const lift = (best.avg - overall) / overall;
  return lift > 0.1 ? { hour: best.hour, lift } : null;
}

/**
 * Close the feedback loop: turn measured metrics into concrete config changes. Returns a
 * patched channel + a human-readable change list. Currently auto-tunes publish times to
 * the best-performing hour. Idempotent and conservative (only changes with clear lift).
 */
export function optimizeChannel(
  channel: ChannelDefinition,
  metrics: PublicationMetric[],
): { channel: ChannelDefinition; changes: string[] } {
  const next: ChannelDefinition = JSON.parse(JSON.stringify(channel));
  const changes: string[] = [];

  const bh = bestHour(metrics);
  if (bh) {
    const hh = `${String(bh.hour).padStart(2, "0")}:00`;
    for (const p of next.platforms) {
      for (const fmt of Object.keys(p.publish_times)) {
        if (p.publish_times[fmt] !== hh) {
          p.publish_times[fmt] = hh;
        }
      }
    }
    changes.push(`Horario de publicación → ${hh} (≈${Math.round(bh.lift * 100)}% más vistas)`);
  }

  return { channel: next, changes };
}
