import { describe, expect, it } from "vitest";
import { analyzeLuz } from "./analyze.js";
import type { LuzRawData } from "./types.js";
import sample from "./fixtures/sample.json" with { type: "json" };

const appliances = [
  { key: "lavadora", duration_h: 2 },
  { key: "coche_ve", duration_h: 7, prefer: "night" as const },
  { key: "termo", duration_h: 1 },
];

const raw = sample as unknown as LuzRawData;

describe("analyzeLuz (deterministic domain logic)", () => {
  it("targets tomorrow's series and verifies facts", () => {
    const p = analyzeLuz(raw, "luz-es", appliances, 0.115);
    expect(p.date).toBe("2026-06-21");
    expect(p.safety.factsVerified).toBe(true);
    expect(p.channelId).toBe("luz-es");
  });

  it("computes min/max metrics correctly from the series", () => {
    const p = analyzeLuz(raw, "luz-es", appliances, 0.115);
    // cheapest hour in tomorrow fixture is 03:00 @ 0.063
    const cheapest = p.keyMetrics.find((m) => m.label.startsWith("Más barata"));
    expect(cheapest?.value).toBe("0.063");
    // most expensive is 20:00 @ 0.159
    const dearest = p.keyMetrics.find((m) => m.label.startsWith("Más cara"));
    expect(dearest?.value).toBe("0.159");
  });

  it("classifies the day vs the 30d baseline", () => {
    // tomorrow avg ~0.101 vs baseline 0.115 -> ratio ~0.88 -> barato
    const p = analyzeLuz(raw, "luz-es", appliances, 0.115);
    expect(p.classification).toBe("barato");
  });

  it("builds a comparison vs today (down)", () => {
    const p = analyzeLuz(raw, "luz-es", appliances, 0.115);
    expect(p.comparison?.direction).toBe("down");
    expect(p.headlineFact.toLowerCase()).toContain("baja");
  });

  it("recommends a night window for the EV charger", () => {
    const p = analyzeLuz(raw, "luz-es", appliances, 0.115);
    const ev = p.recommendation?.items.find((i) => i.label === "coche_ve");
    expect(ev).toBeDefined();
    const startHour = Number(ev!.window.slice(0, 2));
    // cheapest 7h block sits overnight in the fixture
    expect(startHour >= 22 || startHour <= 5).toBe(true);
  });

  it("is deterministic — same input, same output", () => {
    const a = analyzeLuz(raw, "luz-es", appliances, 0.115);
    const b = analyzeLuz(raw, "luz-es", appliances, 0.115);
    expect(a).toEqual(b);
  });

  it("emits a 24-point timeseries for the chart", () => {
    const p = analyzeLuz(raw, "luz-es", appliances, 0.115);
    expect(p.visualData?.type).toBe("timeseries");
    expect(p.visualData?.series).toHaveLength(24);
  });
});
