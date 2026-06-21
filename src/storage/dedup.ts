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
