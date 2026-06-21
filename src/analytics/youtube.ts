import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { resilientFetch } from "../core/util/fetch.js";
import { loadChannelDefinition } from "../config/loader.js";
import { configDir, dbDir } from "../storage/paths.js";
import { getStore } from "../storage/index.js";
import type { PublicationMetric } from "./index.js";

export interface VideoStats {
  views: number;
  likes?: number;
  comments?: number;
}

/** Public video stats via YouTube Data API v3 (needs FACTORY_YT_API_KEY). */
export async function pullVideoStats(videoId: string): Promise<VideoStats | null> {
  const key = process.env.FACTORY_YT_API_KEY;
  if (!key) return null;
  try {
    const res = await resilientFetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${encodeURIComponent(videoId)}&key=${key}`,
    );
    if (!res.ok) return null;
    const j = (await res.json()) as { items?: Array<{ statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }> };
    const s = j.items?.[0]?.statistics;
    if (!s) return null;
    return { views: Number(s.viewCount ?? 0), likes: Number(s.likeCount ?? 0), comments: Number(s.commentCount ?? 0) };
  } catch {
    return null;
  }
}

function hourFromTime(t?: string): number {
  const m = t ? /(\d{1,2}):/.exec(t) : null;
  return m ? Number(m[1]) : 0;
}

/**
 * Pull real metrics for a channel's published YouTube videos and merge them into the
 * metrics file the feedback loop / experiments consume. Returns how many were updated.
 */
export async function pullChannelMetrics(channelId: string): Promise<{ updated: number; reason?: string }> {
  if (!process.env.FACTORY_YT_API_KEY) return { updated: 0, reason: "FACTORY_YT_API_KEY no configurada" };
  const def = await loadChannelDefinition(resolve(configDir(), `${channelId}.yaml`)).catch(() => null);
  const yt = def?.platforms.find((p) => p.id === "youtube");
  const store = await getStore();
  const runs = await store.listRuns(channelId, 120);

  const byKey = new Map<string, PublicationMetric>();
  // Seed with existing metrics so we update rather than overwrite.
  const metricsFile = join(dbDir(), "metrics", `${channelId}.json`);
  try {
    for (const m of JSON.parse(await readFile(metricsFile, "utf8")) as PublicationMetric[]) {
      byKey.set(`${m.date}_${m.format}`, m);
    }
  } catch {
    /* none yet */
  }

  let updated = 0;
  for (const run of runs) {
    for (const pub of run.publications) {
      if (pub.platform !== "youtube" || pub.status !== "published" || !pub.externalId) continue;
      const stats = await pullVideoStats(pub.externalId);
      if (!stats) continue;
      byKey.set(`${run.date}_${pub.format}`, {
        channelId,
        date: run.date,
        platform: "youtube",
        format: pub.format,
        publishHour: hourFromTime(yt?.publish_times?.[pub.format]),
        views: stats.views,
      });
      updated++;
    }
  }

  await mkdir(join(dbDir(), "metrics"), { recursive: true });
  await writeFile(metricsFile, JSON.stringify([...byKey.values()], null, 2));
  return { updated };
}
