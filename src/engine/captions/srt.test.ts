import { describe, expect, it } from "vitest";
import { buildCues, toSrt } from "./srt.js";

const narration =
  "Mañana la luz baja un 18%. Las horas más baratas son de madrugada. Pon la lavadora entre las tres y las cinco. Sígueme para más.";

describe("captions SRT builder", () => {
  it("produces cues that span the full audio duration in order", () => {
    const cues = buildCues(narration, 40, 38);
    expect(cues.length).toBeGreaterThan(0);
    expect(cues[0]!.startSec).toBe(0);
    expect(cues[cues.length - 1]!.endSec).toBeCloseTo(40, 1);
    // monotonic, non-overlapping
    for (let i = 1; i < cues.length; i++) {
      expect(cues[i]!.startSec).toBeGreaterThanOrEqual(cues[i - 1]!.endSec - 1e-6);
    }
  });

  it("wraps lines within max chars per line", () => {
    const cues = buildCues(narration, 40, 30);
    for (const c of cues) {
      for (const line of c.text.split("\n")) {
        expect(line.length).toBeLessThanOrEqual(30);
      }
    }
  });

  it("is deterministic", () => {
    expect(buildCues(narration, 40)).toEqual(buildCues(narration, 40));
  });

  it("emits valid SRT", () => {
    const srt = toSrt(buildCues(narration, 40));
    expect(srt).toMatch(/^1\n00:00:00,000 --> /);
    expect(srt).toContain(" --> ");
  });

  it("handles empty narration", () => {
    expect(buildCues("", 40)).toEqual([]);
  });
});
