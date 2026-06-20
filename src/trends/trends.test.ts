import { describe, expect, it } from "vitest";
import { parseTrendsRss, parseRedditJson, pickRelevantTrend } from "./index.js";

describe("trends parsers", () => {
  it("parses Google Trends RSS titles (incl. CDATA)", () => {
    const xml = `<rss><channel>
      <item><title><![CDATA[Precio de la luz]]></title></item>
      <item><title>Champions League</title></item>
    </channel></rss>`;
    expect(parseTrendsRss(xml)).toEqual(["Precio de la luz", "Champions League"]);
  });

  it("parses Reddit listing titles", () => {
    const json = { data: { children: [{ data: { title: "Post A" } }, { data: { title: "Post B" } }] } };
    expect(parseRedditJson(json)).toEqual(["Post A", "Post B"]);
  });

  it("picks the trend most relevant to the topic", () => {
    const trends = ["Champions League", "Precio de la electricidad sube", "Bolsa"];
    expect(pickRelevantTrend(trends, "precio de la electricidad")).toContain("electricidad");
    // no overlap → top trend
    expect(pickRelevantTrend(trends, "recetas de cocina")).toBe("Champions League");
    expect(pickRelevantTrend([], "x")).toBeNull();
  });
});
