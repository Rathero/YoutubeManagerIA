import { describe, expect, it } from "vitest";
import { cosine } from "./embeddings.js";

describe("cosine similarity", () => {
  it("is 1 for identical vectors", () => {
    expect(cosine([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 5);
  });
  it("is 0 for orthogonal vectors", () => {
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });
  it("ranks similar higher than dissimilar", () => {
    const a = [1, 1, 0];
    expect(cosine(a, [1, 1, 0.1])).toBeGreaterThan(cosine(a, [0, 0, 1]));
  });
});
