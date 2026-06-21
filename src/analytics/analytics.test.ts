import { describe, expect, it } from "vitest";
import { deriveFeedback, type PublicationMetric } from "./index.js";

function make(n: number, hour: number, views: number, format = "short", cls = "barato"): PublicationMetric[] {
  return Array.from({ length: n }, (_, i) => ({
    channelId: "c",
    date: `2026-06-${String(i + 1).padStart(2, "0")}`,
    platform: "youtube",
    format,
    publishHour: hour,
    classification: cls,
    views,
    retentionPct: 50,
  }));
}

describe("deriveFeedback (M6 attribution)", () => {
  it("returns nothing below the data threshold", () => {
    expect(deriveFeedback(make(3, 21, 1000))).toEqual([]);
  });

  it("recommends the best publish hour when one clearly wins", () => {
    const metrics = [...make(8, 21, 5000), ...make(8, 9, 1000)];
    const signals = deriveFeedback(metrics);
    const time = signals.find((s) => s.variable === "publish_time");
    expect(time).toBeDefined();
    expect(time!.recommendation).toContain("21:00");
    expect(time!.confidence).toBeGreaterThan(0);
  });

  it("recommends the best A/B thumbnail variant", () => {
    const metrics: PublicationMetric[] = [
      ...Array.from({ length: 6 }, (_, i) => ({ channelId: "c", date: `d${i}`, platform: "youtube", format: "short", publishHour: 21, thumbnailVariant: "B", views: 5000 })),
      ...Array.from({ length: 6 }, (_, i) => ({ channelId: "c", date: `e${i}`, platform: "youtube", format: "short", publishHour: 21, thumbnailVariant: "A", views: 1500 })),
    ];
    const sig = deriveFeedback(metrics).find((s) => s.variable === "thumbnail");
    expect(sig?.recommendation).toContain("B");
  });

  it("recommends the best format by retention/views", () => {
    const metrics = [
      ...make(6, 21, 3000, "short"),
      ...make(6, 21, 1200, "long"),
    ];
    const signals = deriveFeedback(metrics);
    const fmt = signals.find((s) => s.variable === "format");
    expect(fmt?.recommendation).toContain("short");
  });
});
