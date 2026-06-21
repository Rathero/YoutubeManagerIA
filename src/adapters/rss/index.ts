import type { NicheAdapter } from "../_interface.js";
import type { ContentPayload, RawData, RunContext, Segment } from "../../core/types/index.js";
import { resilientFetch } from "../../core/util/fetch.js";

export interface FeedItem {
  title: string;
  link?: string;
  summary?: string;
  date?: string;
}

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block: string, name: string): string | undefined {
  const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i").exec(block);
  return m ? decode(m[1]!) : undefined;
}

/** Parse an RSS or Atom feed into items (no XML dependency). */
export function parseFeed(xml: string): FeedItem[] {
  const blocks = [...xml.matchAll(/<(item|entry)[\s\S]*?<\/\1>/gi)].map((m) => m[0]);
  return blocks.map((b) => {
    const linkTag = tag(b, "link");
    const hrefMatch = /<link[^>]*href="([^"]+)"/i.exec(b);
    return {
      title: tag(b, "title") ?? "",
      link: hrefMatch?.[1] ?? linkTag,
      summary: tag(b, "description") ?? tag(b, "summary") ?? tag(b, "content"),
      date: tag(b, "pubDate") ?? tag(b, "updated") ?? tag(b, "published"),
    };
  }).filter((i) => i.title);
}

interface RssConfig {
  url: string;
  max_items?: number;
  source_name?: string;
}

/**
 * Declarative RSS/Atom adapter — the "no code" adapter for NEWS/BLOG niches. Point it at
 * a feed and it turns the latest items into a daily digest ContentPayload. Zero code.
 */
class RssAdapter implements NicheAdapter {
  readonly key = "rss";

  private cfg(ctx: RunContext): RssConfig {
    const c = (ctx.channel.data.config ?? {}) as Partial<RssConfig>;
    if (!c.url) throw new Error("rss adapter: data.config.url is required");
    return { url: c.url, max_items: c.max_items ?? 5, source_name: c.source_name };
  }

  private async items(ctx: RunContext): Promise<FeedItem[]> {
    const cfg = this.cfg(ctx);
    const res = await resilientFetch(cfg.url, { headers: { Accept: "application/rss+xml, application/xml, text/xml" } });
    if (!res.ok) throw new Error(`rss adapter: ${res.status} for ${cfg.url}`);
    return parseFeed(await res.text()).slice(0, cfg.max_items);
  }

  async isReady(ctx: RunContext): Promise<{ ready: boolean; reason?: string }> {
    try {
      return (await this.items(ctx)).length > 0 ? { ready: true } : { ready: false, reason: "feed sin items" };
    } catch (err) {
      return { ready: false, reason: (err as Error).message };
    }
  }

  async fetch(ctx: RunContext): Promise<RawData> {
    return this.items(ctx);
  }

  async analyze(raw: RawData, ctx: RunContext): Promise<ContentPayload> {
    const items = raw as FeedItem[];
    if (items.length === 0) throw new Error("rss adapter: no items");
    const cfg = this.cfg(ctx);
    const segments: Segment[] = items.map((it) => ({ title: it.title, detail: (it.summary ?? "").slice(0, 240), dataRef: it.link }));
    return {
      channelId: ctx.channel.id,
      date: ctx.date,
      headlineFact: `Lo más destacado de hoy: ${items[0]!.title}`,
      keyMetrics: [{ label: "Titulares", value: items.length, emphasis: "primary" }],
      segments,
      context: `Resumen de ${items.length} titulares recientes de ${cfg.source_name ?? new URL(cfg.url).hostname}.`,
      cta: "Sígueme para el resumen de cada día.",
      sourceRef: { name: cfg.source_name ?? new URL(cfg.url).hostname, url: cfg.url },
      safety: { factsVerified: true, notes: `Feed RSS, ${items.length} items.` },
    };
  }
}

export function createRssAdapter(): NicheAdapter {
  return new RssAdapter();
}
