import { describe, expect, it } from "vitest";
import { estimateChannel } from "./estimate.js";
import { localizeChannel } from "../genesis/localize.js";
import { buildNewsletterMarkdown } from "../distribution/own/newsletter.js";
import { loadChannelDefinition } from "../config/loader.js";
import { resolve } from "node:path";

const luz = await loadChannelDefinition(resolve(process.cwd(), "src/config/luz-es.yaml"));
const local = await loadChannelDefinition(resolve(process.cwd(), "src/config/historia-local.yaml"));

describe("cost estimate", () => {
  it("a local stack costs $0", () => {
    const e = estimateChannel(local);
    expect(e.fullyLocal).toBe(true);
    expect(e.perMonthUsd).toBe(0);
  });
  it("a cloud data-card channel has a positive cost", () => {
    const e = estimateChannel(luz);
    expect(e.perMonthUsd).toBeGreaterThan(0);
    expect(e.breakdown.voice).toBeGreaterThanOrEqual(0);
  });
});

describe("localize (multi-idioma)", () => {
  it("derives a child with the target language and a -lang id (no LLM)", async () => {
    const en = await localizeChannel(luz, "en", null);
    expect(en.id.endsWith("-en")).toBe(true);
    expect(en.identity.language).toBe("en-US");
    expect(en.status).toBe("draft");
    expect(en.script.language_rules).toContain("English");
  });
});

describe("newsletter markdown", () => {
  it("renders the payload as a readable edition", () => {
    const md = buildNewsletterMarkdown(luz, {
      channelId: "luz-es",
      date: "2026-06-21",
      headlineFact: "La luz baja",
      keyMetrics: [{ label: "Media", value: "0.1", unit: "€/kWh", emphasis: "primary" }],
      segments: [{ title: "Horas baratas", detail: "de noche" }],
      sourceRef: { name: "fuente" },
      safety: { factsVerified: true },
    });
    expect(md).toContain("# Precio de la Luz Hoy");
    expect(md).toContain("**La luz baja**");
    expect(md).toContain("Horas baratas");
  });
});
