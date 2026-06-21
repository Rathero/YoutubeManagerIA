import { describe, expect, it } from "vitest";
import { analyticsSummary } from "./summary.js";
import type { PublicationMetric } from "./index.js";

const metrics: PublicationMetric[] = [
  { channelId: "c", date: "2026-06-01", platform: "youtube", format: "short", publishHour: 9, views: 1000, subs: 10, retentionPct: 40 },
  { channelId: "c", date: "2026-06-01", platform: "youtube", format: "long", publishHour: 21, views: 500, subs: 5, retentionPct: 55 },
  { channelId: "c", date: "2026-06-02", platform: "youtube", format: "short", publishHour: 9, views: 3000, subs: 30, retentionPct: 42 },
];

describe("analyticsSummary", () => {
  it("totals and aggregates correctly", () => {
    const s = analyticsSummary(metrics);
    expect(s.totals.publications).toBe(3);
    expect(s.totals.views).toBe(4500);
    expect(s.totals.subs).toBe(45);
    expect(s.totals.avgRetentionPct).toBeCloseTo(45.7, 0);
  });

  it("buckets by date sorted ascending", () => {
    const s = analyticsSummary(metrics);
    expect(s.viewsByDate.map((d) => d.label)).toEqual(["2026-06-01", "2026-06-02"]);
    expect(s.viewsByDate[0]!.value).toBe(1500);
  });

  it("identifies the best hour and format", () => {
    const s = analyticsSummary(metrics);
    expect(s.best.hour).toBe(9); // 9:00 averages 2000 vs 500 at 21:00
    expect(s.best.format).toBe("short");
  });

  it("returns empty series with no data", () => {
    const s = analyticsSummary([]);
    expect(s.totals.views).toBe(0);
    expect(s.viewsByDate).toEqual([]);
    expect(s.best.hour).toBeUndefined();
  });
});
