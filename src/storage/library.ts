import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { dbDir } from "./paths.js";

export interface LibraryEntry {
  channelId: string;
  date: string;
  headline: string;
  classification?: string;
}

/** Search all saved payloads (every channel) by substring on headline/channel/date. */
export async function searchLibrary(q = "", limit = 100): Promise<LibraryEntry[]> {
  const dir = join(dbDir(), "payloads");
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  files.sort().reverse();
  const needle = q.trim().toLowerCase();
  const out: LibraryEntry[] = [];
  for (const f of files) {
    if (out.length >= limit) break;
    try {
      const p = JSON.parse(await readFile(join(dir, f), "utf8")) as { channelId?: string; date?: string; headlineFact?: string; classification?: string };
      const entry: LibraryEntry = {
        channelId: p.channelId ?? f.split("_")[0]!,
        date: p.date ?? "",
        headline: p.headlineFact ?? "",
        classification: p.classification,
      };
      const hay = `${entry.channelId} ${entry.date} ${entry.headline} ${entry.classification ?? ""}`.toLowerCase();
      if (!needle || hay.includes(needle)) out.push(entry);
    } catch {
      /* skip */
    }
  }
  return out;
}
