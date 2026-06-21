import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { RenderedAsset, ThumbnailAsset } from "../core/types/index.js";
import { dbDir, runDir } from "./paths.js";

export interface VersionFile {
  kind: "video" | "thumbnail";
  format: string;
  original: string;
  archived: string;
}
export interface VersionRecord {
  runId: string;
  createdAt: string;
  headline?: string;
  style?: string;
  files: VersionFile[];
}

function manifestPath(channelId: string, date: string): string {
  return join(dbDir(), "versions", `${channelId}_${date}.json`);
}

async function exists(p: string): Promise<boolean> {
  try {
    await readFile(p);
    return true;
  } catch {
    return false;
  }
}

/** Copy this run's media into a per-runId archive and record a version manifest. */
export async function archiveVersion(
  channelId: string,
  date: string,
  runId: string,
  rendered: RenderedAsset[],
  thumbnails: ThumbnailAsset[],
  meta: { headline?: string; style?: string },
): Promise<void> {
  const archiveDir = join(runDir(channelId, date), "versions", runId);
  await mkdir(archiveDir, { recursive: true });
  const files: VersionFile[] = [];
  const copyInto = async (kind: VersionFile["kind"], format: string, src: string) => {
    if (!(await exists(src))) return;
    const dst = join(archiveDir, `${kind}-${format}-${basename(src)}`);
    await copyFile(src, dst);
    files.push({ kind, format, original: src, archived: dst });
  };
  for (const r of rendered) await copyInto("video", `${r.format}-${r.aspectRatio.replace(":", "x")}`, r.path);
  for (const t of thumbnails) await copyInto("thumbnail", t.format, t.path);
  if (files.length === 0) return;

  await mkdir(join(dbDir(), "versions"), { recursive: true });
  const list = await listVersions(channelId, date);
  list.unshift({ runId, createdAt: new Date().toISOString(), headline: meta.headline, style: meta.style, files });
  await writeFile(manifestPath(channelId, date), JSON.stringify(list.slice(0, 50), null, 2));
}

export async function listVersions(channelId: string, date: string): Promise<VersionRecord[]> {
  try {
    return JSON.parse(await readFile(manifestPath(channelId, date), "utf8")) as VersionRecord[];
  } catch {
    return [];
  }
}

/** Promote an archived version: copy its files back to the canonical paths. */
export async function promoteVersion(channelId: string, date: string, runId: string): Promise<boolean> {
  const v = (await listVersions(channelId, date)).find((x) => x.runId === runId);
  if (!v) return false;
  for (const f of v.files) {
    if (await exists(f.archived)) await copyFile(f.archived, f.original);
  }
  return true;
}
