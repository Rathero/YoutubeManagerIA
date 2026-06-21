import { describe, expect, it } from "vitest";
import { toRunRecord } from "./store.js";

describe("run record version metadata", () => {
  it("captures headline + style + voice for versioning", () => {
    const ctx: any = {
      runId: "r1",
      channel: { id: "ch", video: { style: "cinematic" }, voice: { provider: "elevenlabs" } },
      date: "2026-06-21",
      stageRecords: [],
      publications: [],
      payload: { headlineFact: "Un titular" },
    };
    const rec = toRunRecord(ctx, "completed");
    expect(rec.meta).toEqual({ headline: "Un titular", style: "cinematic", voice: "elevenlabs" });
  });

  it("handles a data-card channel without video", () => {
    const ctx: any = {
      runId: "r2", channel: { id: "ch", voice: { provider: "stub" } }, date: "d",
      stageRecords: [], publications: [], payload: { headlineFact: "X" },
    };
    expect(toRunRecord(ctx, "completed").meta).toEqual({ headline: "X", style: undefined, voice: "stub" });
  });
});
