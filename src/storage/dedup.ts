import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { dbDir } from "./paths.js";

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

/** Headlines from this channel's previously-saved payloads (excluding a given date). */
export async function recentHeadlines(channelId: string, excludeDate: string, limit = 40): Promise<string[]> {
  const dir = join(dbDir(), "payloads");
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.startsWith(`${channelId}_`) && f.endsWith(".json"));
  } catch {
    return [];
  }
  files.sort().reverse();
  const out: string[] = [];
  for (const f of files.slice(0, limit)) {
    if (f === `${channelId}_${excludeDate}.json`) continue;
    try {
      const p = JSON.parse(await readFile(join(dir, f), "utf8")) as { headlineFact?: string };
      if (p.headlineFact) out.push(p.headlineFact);
    } catch {
      /* skip */
    }
  }
  return out;
}

/** True if `headline` repeats a recent one (normalized exact match). */
export function isDuplicateHeadline(headline: string, recent: string[]): boolean {
  const h = norm(headline);
  return recent.some((r) => norm(r) === h);
}

function tokens(s: string): Set<string> {
  return new Set(norm(s).split(" ").filter((w) => w.length > 2));
}

/** Jaccard similarity of word sets (0..1). */
export function jaccard(a: string, b: string): number {
  const ta = tokens(a), tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

/** Find a recent headline that is near-duplicate (>= threshold), or null. */
export function nearDuplicate(headline: string, recent: string[], threshold = 0.7): { match: string; score: number } | null {
  let best: { match: string; score: number } | null = null;
  for (const r of recent) {
    const score = jaccard(headline, r);
    if (score >= threshold && (!best || score > best.score)) best = { match: r, score: Math.round(score * 100) / 100 };
  }
  return best;
}
