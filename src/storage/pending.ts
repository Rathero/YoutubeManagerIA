import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PlatformMeta, RenderedAsset } from "../core/types/index.js";
import { dbDir } from "./paths.js";

export interface PendingItem {
  platform: PlatformMeta["platform"];
  format: string;
  asset: RenderedAsset;
  meta: PlatformMeta;
  accountRef: string;
  mode: "auto" | "assisted";
}

export interface PendingRecord {
  channelId: string;
  date: string;
  createdAt: string;
  items: PendingItem[];
}

function dir(): string {
  return join(dbDir(), "pending");
}
function file(channelId: string, date: string): string {
  return join(dir(), `${channelId}_${date}.json`);
}

export async function savePending(rec: PendingRecord): Promise<string> {
  await mkdir(dir(), { recursive: true });
  const f = file(rec.channelId, rec.date);
  await writeFile(f, JSON.stringify(rec, null, 2));
  return f;
}

export async function loadPending(channelId: string, date: string): Promise<PendingRecord | null> {
  try {
    return JSON.parse(await readFile(file(channelId, date), "utf8")) as PendingRecord;
  } catch {
    return null;
  }
}

export async function deletePending(channelId: string, date: string): Promise<void> {
  await rm(file(channelId, date), { force: true });
}

export async function listPending(): Promise<PendingRecord[]> {
  let files: string[];
  try {
    files = (await readdir(dir())).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  const out: PendingRecord[] = [];
  for (const f of files) {
    try {
      out.push(JSON.parse(await readFile(join(dir(), f), "utf8")) as PendingRecord);
    } catch {
      /* skip */
    }
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
