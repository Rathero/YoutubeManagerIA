import type { ChannelDefinition } from "../core/types/index.js";
import type { RunRecord } from "../storage/store.js";

export interface FeedItem {
  id: string;
  title: string;
  date: string;
  url?: string;
  summary: string;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** First published URL for a run, if any (the canonical link for syndication). */
function runUrl(rec: RunRecord): string | undefined {
  return rec.publications.find((p) => p.url)?.url;
}

/** Build syndication items from completed runs (newest first, deduped per date by newest run). */
export function feedItems(runs: RunRecord[], limit = 50): FeedItem[] {
  const completed = runs
    .filter((r) => r.status === "completed" && r.meta?.headline)
    .sort((a, b) => (b.createdAt || b.date).localeCompare(a.createdAt || a.date));
  const seen = new Set<string>();
  const items: FeedItem[] = [];
  for (const r of completed) {
    if (seen.has(r.date)) continue; // newest run wins per date
    seen.add(r.date);
    items.push({
      id: r.runId,
      title: r.meta!.headline!,
      date: r.date,
      url: runUrl(r),
      summary: [r.meta?.style ? `Estilo: ${r.meta.style}` : "", r.publications.length ? `${r.publications.length} salida(s)` : ""]
        .filter(Boolean)
        .join(" · "),
    });
    if (items.length >= limit) break;
  }
  return items;
}

/** JSON Feed 1.1 (https://jsonfeed.org). `siteUrl` is the public base for item links. */
export function buildJsonFeed(channel: ChannelDefinition, runs: RunRecord[], siteUrl = ""): string {
  const items = feedItems(runs);
  return JSON.stringify(
    {
      version: "https://jsonfeed.org/version/1.1",
      title: channel.identity.name,
      description: channel.niche.value_proposition,
      home_page_url: siteUrl || undefined,
      items: items.map((it) => ({
        id: it.id,
        title: it.title,
        url: it.url,
        date_published: `${it.date}T00:00:00Z`,
        content_text: it.summary || it.title,
      })),
    },
    null,
    2,
  );
}

/** RSS 2.0 XML. */
export function buildRssFeed(channel: ChannelDefinition, runs: RunRecord[], siteUrl = ""): string {
  const items = feedItems(runs);
  const entries = items
    .map((it) => {
      const link = it.url ? `<link>${escapeXml(it.url)}</link>` : "";
      const pub = new Date(`${it.date}T00:00:00Z`).toUTCString();
      return (
        `    <item>\n` +
        `      <title>${escapeXml(it.title)}</title>\n` +
        `      ${link}\n` +
        `      <guid isPermaLink="false">${escapeXml(it.id)}</guid>\n` +
        `      <pubDate>${pub}</pubDate>\n` +
        `      <description>${escapeXml(it.summary || it.title)}</description>\n` +
        `    </item>`
      );
    })
    .join("\n");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0"><channel>\n` +
    `    <title>${escapeXml(channel.identity.name)}</title>\n` +
    `    <link>${escapeXml(siteUrl)}</link>\n` +
    `    <description>${escapeXml(channel.niche.value_proposition)}</description>\n` +
    `${entries}\n` +
    `</channel></rss>\n`
  );
}
