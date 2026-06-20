import { describe, expect, it } from "vitest";
import { buildUtmUrl, pickAffiliate } from "./affiliate.js";
import type { ContentPayload } from "../core/types/index.js";

const payload: ContentPayload = {
  channelId: "luz-es",
  date: "2026-06-21",
  headlineFact: "Buen día para cargar baterías solares",
  keyMetrics: [],
  segments: [{ title: "Placas solares", detail: "rinden más al mediodía" }],
  sourceRef: { name: "x" },
  safety: { factsVerified: true },
};

describe("affiliate", () => {
  it("adds UTM params", () => {
    const u = buildUtmUrl("https://shop.com/p?ref=1", { source: "youtube", campaign: "luz-es", content: "2026-06-21" });
    expect(u).toContain("utm_source=youtube");
    expect(u).toContain("utm_campaign=luz-es");
    expect(u).toContain("ref=1"); // preserves existing query
  });

  it("picks the contextually relevant vertical", () => {
    const links = { "coche electrico": "https://a", "placas solares": "https://b", baterias: "https://c" };
    const picked = pickAffiliate(payload, links);
    // "placas solares" appears in the segment title → chosen
    expect(picked?.url).toBe("https://b");
  });

  it("falls back to the first link when nothing matches", () => {
    const links = { "coche electrico": "https://a" };
    expect(pickAffiliate(payload, links)?.url).toBe("https://a");
    expect(pickAffiliate(payload, {})).toBeNull();
  });
});
