/**
 * Schedule preview. Computes the next run datetimes for a channel from its `trigger.at`,
 * which may be a simple "HH:mm" (daily) or a 5-field cron ("m h * * dow"). Pure + UTC-based so
 * it is deterministic and unit-testable; the worker still owns real scheduling.
 */

export interface ParsedSchedule {
  minutes: number[]; // 0..59
  hours: number[]; // 0..23
  /** Days of week 0(Sun)..6(Sat); empty = every day. */
  daysOfWeek: number[];
}

function expandField(field: string, min: number, max: number): number[] {
  if (field === "*" || field === "") return range(min, max);
  const out = new Set<number>();
  for (const part of field.split(",")) {
    const step = part.includes("/") ? Number.parseInt(part.split("/")[1]!, 10) : 1;
    const base = part.split("/")[0]!;
    let lo = min;
    let hi = max;
    if (base !== "*" && base.includes("-")) {
      const [a, b] = base.split("-");
      lo = Number.parseInt(a!, 10);
      hi = Number.parseInt(b!, 10);
    } else if (base !== "*") {
      lo = hi = Number.parseInt(base, 10);
    }
    for (let v = lo; v <= hi; v += step) if (v >= min && v <= max) out.add(v);
  }
  return [...out].sort((a, b) => a - b);
}

function range(a: number, b: number): number[] {
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

/** Parse "HH:mm" or a 5-field cron into normalized minute/hour/dow sets. */
export function parseSchedule(at: string | undefined): ParsedSchedule | null {
  if (!at) return null;
  const trimmed = at.trim();
  // Simple "HH:mm".
  const hm = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (hm) {
    return { minutes: [Number.parseInt(hm[2]!, 10)], hours: [Number.parseInt(hm[1]!, 10)], daysOfWeek: [] };
  }
  // 5-field cron: min hour dom month dow (dom/month ignored for this preview).
  const f = trimmed.split(/\s+/);
  if (f.length === 5) {
    const minutes = expandField(f[0]!, 0, 59);
    const hours = expandField(f[1]!, 0, 23);
    const dow = f[4] === "*" ? [] : expandField(f[4]!, 0, 6).map((d) => d % 7);
    if (minutes.length && hours.length) return { minutes, hours, daysOfWeek: dow };
  }
  return null;
}

/** Next `count` run instants at/after `from` (UTC). Returns ISO strings. */
export function nextRuns(at: string | undefined, from: Date, count = 5): string[] {
  const parsed = parseSchedule(at);
  if (!parsed) return [];
  const out: string[] = [];
  // Scan minute-by-minute up to ~32 days ahead — cheap and exact for these field sets.
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), from.getUTCHours(), from.getUTCMinutes() + 1, 0, 0));
  const limit = 32 * 24 * 60;
  for (let i = 0; i < limit && out.length < count; i++) {
    const m = cursor.getUTCMinutes();
    const h = cursor.getUTCHours();
    const d = cursor.getUTCDay();
    const dowOk = parsed.daysOfWeek.length === 0 || parsed.daysOfWeek.includes(d);
    if (dowOk && parsed.hours.includes(h) && parsed.minutes.includes(m)) {
      out.push(cursor.toISOString().slice(0, 16) + "Z");
    }
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  }
  return out;
}
