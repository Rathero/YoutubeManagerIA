import { describe, expect, it } from "vitest";
import { qualityScore } from "./quality.js";
import type { ContentPayload } from "../../core/types/index.js";

const rich: ContentPayload = {
  channelId: "c", date: "d",
  headlineFact: "Mañana la luz baja un 18% respecto a hoy",
  keyMetrics: [{ label: "a", value: 1, emphasis: "primary" }, { label: "b", value: 2, emphasis: "secondary" }],
  segments: [{ title: "s1", detail: "d1" }, { title: "s2", detail: "d2" }],
  recommendation: { headline: "Cuándo", items: [{ label: "x", window: "03:00" }] },
  context: "Esto importa porque ahorras planificando consumos.",
  sourceRef: { name: "fuente", url: "https://x" },
  safety: { factsVerified: true },
};

describe("quality score", () => {
  it("scores a rich payload high", () => {
    expect(qualityScore(rich).score).toBeGreaterThanOrEqual(90);
  });

  it("scores a thin payload low with reasons", () => {
    const thin: ContentPayload = {
      channelId: "c", date: "d", headlineFact: "Hoy",
      keyMetrics: [], segments: [], sourceRef: { name: "x" }, safety: { factsVerified: false },
    };
    const q = qualityScore(thin);
    expect(q.score).toBeLessThan(45);
    expect(q.factors.length).toBeGreaterThan(2);
  });
});
