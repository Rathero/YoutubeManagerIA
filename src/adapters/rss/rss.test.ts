import { describe, expect, it } from "vitest";
import { parseFeed } from "./index.js";

describe("RSS/Atom feed parser", () => {
  it("parses RSS items", () => {
    const xml = `<rss><channel>
      <item><title>Primera noticia</title><link>https://a/1</link><description><![CDATA[<b>Resumen</b> uno]]></description><pubDate>Mon, 01 Jun 2026</pubDate></item>
      <item><title>Segunda</title><link>https://a/2</link><description>dos</description></item>
    </channel></rss>`;
    const items = parseFeed(xml);
    expect(items).toHaveLength(2);
    expect(items[0]!.title).toBe("Primera noticia");
    expect(items[0]!.link).toBe("https://a/1");
    expect(items[0]!.summary).toBe("Resumen uno");
  });

  it("parses Atom entries (link href + summary)", () => {
    const xml = `<feed><entry><title>Hola</title><link href="https://b/x"/><summary>texto</summary><updated>2026</updated></entry></feed>`;
    const items = parseFeed(xml);
    expect(items[0]!.title).toBe("Hola");
    expect(items[0]!.link).toBe("https://b/x");
    expect(items[0]!.summary).toBe("texto");
  });

  it("returns [] for non-feed input", () => {
    expect(parseFeed("<html></html>")).toEqual([]);
  });
});
