import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PlatformMeta, RenderedAsset } from "../core/types/index.js";
import { runDir } from "../storage/paths.js";

/**
 * The "publish in 1 tap" queue. For platforms whose automated direct-post isn't
 * approved (TikTok/IG, or YouTube without OAuth), we drop a ready-to-post bundle:
 * the rendered file path + the exact copy + hashtags. The operator publishes it
 * manually in seconds, with zero ToS risk from unauthorized automation.
 */
export async function enqueueAssisted(
  channelId: string,
  date: string,
  asset: RenderedAsset,
  meta: PlatformMeta,
): Promise<string> {
  const dir = join(runDir(channelId, date), "queue");
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${meta.platform}-${meta.format}.json`);
  const bundle = {
    platform: meta.platform,
    format: meta.format,
    file: asset.path,
    aspectRatio: asset.aspectRatio,
    thumbnail: (meta.extra?.thumbnailPath as string | undefined) ?? null,
    subtitles: (meta.extra?.captionsPath as string | undefined) ?? null,
    title: meta.title,
    description: meta.description,
    hashtags: meta.hashtags,
    copyPasteCaption: [meta.title, "", meta.description, meta.hashtags.join(" ")]
      .filter(Boolean)
      .join("\n"),
    createdAt: new Date().toISOString(),
  };
  await writeFile(path, JSON.stringify(bundle, null, 2));
  return path;
}
