/**
 * Trend detection — pulls "what's hot today" to feed the generative adapter's angle
 * selection (or just to inspect via `factory trends`). Sources are keyless/free:
 * Google Trends daily RSS and Reddit. Falls back to [] on any failure (offline-safe).
 */
export type TrendSource = "google" | "reddit" | "none";

/** Parse Google Trends daily RSS — extract <item><title> values. */
export function parseTrendsRss(xml: string): string[] {
  const items = [...xml.matchAll(/<item>[\s\S]*?<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/g)];
  return items.map((m) => m[1]!.trim()).filter(Boolean);
}

/** Parse a Reddit listing JSON into post titles. */
export function parseRedditJson(json: unknown): string[] {
  const children = (json as any)?.data?.children ?? [];
  return children.map((c: any) => c?.data?.title).filter((t: unknown): t is string => typeof t === "string");
}

export async function fetchTrends(source: TrendSource, geo = "US"): Promise<string[]> {
  try {
    if (source === "google") {
      const res = await fetch(`https://trends.google.com/trending/rss?geo=${encodeURIComponent(geo)}`);
      if (!res.ok) return [];
      return parseTrendsRss(await res.text()).slice(0, 20);
    }
    if (source === "reddit") {
      const res = await fetch("https://www.reddit.com/r/popular/top.json?limit=20&t=day", {
        headers: { "user-agent": "channel-factory/0.1 (trends)" },
      });
      if (!res.ok) return [];
      return parseRedditJson(await res.json()).slice(0, 20);
    }
  } catch {
    /* offline */
  }
  return [];
}

/** Pick the trend most relevant to a topic (keyword overlap), or the top trend. */
export function pickRelevantTrend(trends: string[], topic: string): string | null {
  if (trends.length === 0) return null;
  const topicWords = topic.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
  let best: { trend: string; score: number } | null = null;
  for (const t of trends) {
    const lt = t.toLowerCase();
    const score = topicWords.reduce((n, w) => n + (lt.includes(w) ? 1 : 0), 0);
    if (!best || score > best.score) best = { trend: t, score };
  }
  return best && best.score > 0 ? best.trend : trends[0]!;
}
