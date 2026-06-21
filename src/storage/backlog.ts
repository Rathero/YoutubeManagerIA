import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { dbDir } from "./paths.js";

export interface BacklogItem {
  angle: string;
  addedAt: string;
  usedDate?: string;
}

function file(channelId: string): string {
  return join(dbDir(), "backlog", `${channelId}.json`);
}

export async function loadBacklog(channelId: string): Promise<BacklogItem[]> {
  try {
    return JSON.parse(await readFile(file(channelId), "utf8")) as BacklogItem[];
  } catch {
    return [];
  }
}

async function save(channelId: string, items: BacklogItem[]): Promise<void> {
  const f = file(channelId);
  await mkdir(join(dbDir(), "backlog"), { recursive: true });
  await writeFile(f, JSON.stringify(items, null, 2));
}

/** Append ideas to the channel's backlog (skips duplicates). */
export async function addToBacklog(channelId: string, angles: string[]): Promise<number> {
  const items = await loadBacklog(channelId);
  const have = new Set(items.map((i) => i.angle.toLowerCase()));
  let added = 0;
  for (const a of angles.map((s) => s.trim()).filter(Boolean)) {
    if (have.has(a.toLowerCase())) continue;
    items.push({ angle: a, addedAt: new Date().toISOString() });
    have.add(a.toLowerCase());
    added++;
  }
  await save(channelId, items);
  return added;
}

/**
 * Returns the angle planned for a date: the one already assigned to it (idempotent),
 * else the next unused item (which it marks as used for that date). Null if empty.
 */
export async function nextForDate(channelId: string, date: string): Promise<string | null> {
  const items = await loadBacklog(channelId);
  const existing = items.find((i) => i.usedDate === date);
  if (existing) return existing.angle;
  const fresh = items.find((i) => !i.usedDate);
  if (!fresh) return null;
  fresh.usedDate = date;
  await save(channelId, items);
  return fresh.angle;
}
