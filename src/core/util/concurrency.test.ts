import { describe, expect, it } from "vitest";
import { mapLimit } from "./concurrency.js";

describe("mapLimit", () => {
  it("preserves order and maps all items", async () => {
    const out = await mapLimit([1, 2, 3, 4, 5], 2, async (x) => x * 2);
    expect(out).toEqual([2, 4, 6, 8, 10]);
  });

  it("respects the concurrency limit", async () => {
    let active = 0, maxActive = 0;
    await mapLimit([1, 2, 3, 4, 5, 6], 2, async () => {
      active++; maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
    });
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it("handles empty input", async () => {
    expect(await mapLimit([], 3, async (x) => x)).toEqual([]);
  });
});
