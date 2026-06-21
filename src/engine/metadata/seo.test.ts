import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { loadChannelDefinition } from "../../config/loader.js";
import { seoTags, scoreTitle, pickBestTitle } from "./seo.js";
import type { ContentPayload } from "../../core/types/index.js";

const luz = await loadChannelDefinition(resolve(process.cwd(), "src/config/luz-es.yaml"));

const payload: ContentPayload = {
  channelId: "luz-es",
  date: "2026-06-21",
  headlineFact: "Mañana la luz baja un 18% en la franja valle",
  keyMetrics: [
    { label: "precio medio", value: 0.12, unit: "€/kWh", emphasis: "primary" },
    { label: "hora barata", value: "03:00", emphasis: "secondary" },
  ],
  segments: [],
  sourceRef: { name: "REE" },
  safety: { factsVerified: true },
};

describe("seoTags", () => {
  it("starts with the topic and stays deduped + budgeted", () => {
    const tags = seoTags(luz, payload);
    expect(tags.length).toBeGreaterThan(0);
    expect(new Set(tags).size).toBe(tags.length); // no dupes
    expect(tags.join(",").length).toBeLessThanOrEqual(480);
    expect(tags.every((t) => !t.startsWith("#"))).toBe(true); // keywords, not hashtags
  });

  it("includes salient headline words and drops stopwords", () => {
    const tags = seoTags(luz, payload);
    expect(tags.join(" ")).toContain("valle"); // salient 5-char word from the headline
    expect(tags).not.toContain("la"); // no standalone stopword tag
  });
});

describe("scoreTitle", () => {
  it("rewards numbers, questions and a good length", () => {
    const good = scoreTitle("¿Por qué la luz baja un 18% mañana? Guía rápida");
    const bad = scoreTitle("luz");
    expect(good).toBeGreaterThan(bad);
    expect(good).toBeGreaterThan(40);
  });

  it("penalizes ALL CAPS", () => {
    expect(scoreTitle("ESTO ES UNA ESTAFA TOTAL")).toBeLessThan(scoreTitle("Esto es una estafa total"));
  });
});

describe("pickBestTitle", () => {
  it("chooses the highest-scoring variant", () => {
    const best = pickBestTitle([
      { title: "luz" },
      { title: "¿Por qué la luz baja un 18% mañana? 👀" },
      { title: "noticia" },
    ]);
    expect(best.title).toContain("18%");
  });
});
