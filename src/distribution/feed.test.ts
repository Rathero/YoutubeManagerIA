import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { loadChannelDefinition } from "../config/loader.js";
import { feedItems, buildJsonFeed, buildRssFeed } from "./feed.js";
import type { RunRecord } from "../storage/store.js";

const luz = await loadChannelDefinition(resolve(process.cwd(), "src/config/luz-es.yaml"));

const runs: RunRecord[] = [
  { runId: "r1", channelId: "luz-es", date: "2026-06-20", status: "completed", stages: [], createdAt: "2026-06-20T20:00:00Z",
    publications: [{ platform: "youtube", format: "short", status: "published", url: "https://yt/abc" }] as any, meta: { headline: "Ayer", style: "data_card" } },
  { runId: "r2", channelId: "luz-es", date: "2026-06-21", status: "completed", stages: [], createdAt: "2026-06-21T08:00:00Z",
    publications: [] as any, meta: { headline: "Hoy primera versión" } },
  { runId: "r3", channelId: "luz-es", date: "2026-06-21", status: "completed", stages: [], createdAt: "2026-06-21T20:00:00Z",
    publications: [] as any, meta: { headline: "Hoy regenerado" } },
  { runId: "r4", channelId: "luz-es", date: "2026-06-19", status: "failed", stages: [], createdAt: "2026-06-19T20:00:00Z", publications: [] as any },
];

describe("feedItems", () => {
  it("keeps completed runs only, newest per date, ordered desc", () => {
    const items = feedItems(runs);
    expect(items.map((i) => i.date)).toEqual(["2026-06-21", "2026-06-20"]);
    expect(items[0]!.title).toBe("Hoy regenerado"); // newest run wins for 06-21
    expect(items[1]!.url).toBe("https://yt/abc");
  });
});

describe("buildJsonFeed", () => {
  it("emits valid JSON Feed 1.1", () => {
    const feed = JSON.parse(buildJsonFeed(luz, runs, "https://site"));
    expect(feed.version).toContain("jsonfeed.org");
    expect(feed.title).toBe(luz.identity.name);
    expect(feed.items).toHaveLength(2);
    expect(feed.items[0].date_published).toBe("2026-06-21T00:00:00Z");
  });
});

describe("buildRssFeed", () => {
  it("emits RSS 2.0 and escapes XML", () => {
    const xml = buildRssFeed(luz, runs, "https://site");
    expect(xml).toContain('<rss version="2.0">');
    expect(xml).toContain("<item>");
    expect(xml).toContain("https://yt/abc");
    expect(xml).not.toMatch(/<title><[^/]/); // titles are escaped, no nested tags
  });
});
