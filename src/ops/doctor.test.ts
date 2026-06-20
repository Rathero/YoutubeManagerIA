import { describe, expect, it } from "vitest";
import { modelPresent } from "./doctor.js";

describe("doctor: Ollama model presence check", () => {
  it("matches an exact model id", () => {
    expect(modelPresent("qwen3", ["qwen3", "llama3.2"])).toBe(true);
  });

  it("matches ignoring the :tag", () => {
    expect(modelPresent("qwen3", ["qwen3:latest", "nomic-embed-text:latest"])).toBe(true);
    expect(modelPresent("llama3.2:3b", ["llama3.2:latest"])).toBe(true);
  });

  it("returns false when the model is not downloaded", () => {
    expect(modelPresent("qwen3", ["llama3.2:latest"])).toBe(false);
    expect(modelPresent("qwen3", [])).toBe(false);
  });
});
