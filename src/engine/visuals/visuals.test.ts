import { describe, expect, it } from "vitest";
import { analyzeLuz } from "../../adapters/luz/analyze.js";
import type { LuzRawData } from "../../adapters/luz/types.js";
import sample from "../../adapters/luz/fixtures/sample.json" with { type: "json" };
import { deterministicScript } from "../script/deterministic.js";
import { deterministicStoryboard } from "./storyboard.js";
import { buildVideoPrompt, resolveStyle, BUILT_IN_STYLES } from "./style.js";
import type { VideoConfig } from "../../core/types/index.js";

const payload = analyzeLuz(sample as unknown as LuzRawData, "luz-es", [{ key: "lavadora", duration_h: 2 }], 0.115);
const fmt = { kind: "short" as const, enabled: true, target_seconds: 40, structure: ["hook", "dato_clave", "cta"] };
const script = deterministicScript(payload, fmt, 110);
const video: VideoConfig = {
  mode: "generative",
  provider: "veo",
  style: "anime",
  clip_seconds: 8,
  resolution: "1080p",
  use_native_audio: false,
  max_clips: 4,
  llm_storyboard: true,
  custom_styles: {},
};

describe("visual style system", () => {
  it("resolves a built-in style", () => {
    expect(resolveStyle(video).key).toBe("anime");
    expect(resolveStyle({ ...video, style: "nope" }).key).toBe("realistic"); // fallback
  });

  it("resolves a custom style override", () => {
    const custom = resolveStyle({
      ...video,
      style: "mylook",
      custom_styles: { mylook: { descriptor: "neon cyberpunk", photoreal: false } },
    });
    expect(custom.descriptor).toBe("neon cyberpunk");
  });

  it("builds provider-specific prompts (Veo gets a separate negative)", () => {
    const style = BUILT_IN_STYLES.realistic!;
    const shot = { index: 0, seconds: 8, narration: "hola", scene: "a kitchen at night" };
    const veo = buildVideoPrompt("veo", shot, style, "9:16");
    expect(veo.negativePrompt).toBeTruthy();
    expect(veo.prompt).toContain("9:16");

    const sora = buildVideoPrompt("sora", shot, style, "16:9");
    expect(sora.negativePrompt).toBeUndefined(); // folded into the paragraph
    expect(sora.prompt.toLowerCase()).toContain("avoid");
  });
});

describe("deterministic storyboard", () => {
  it("produces shots capped by max_clips and is deterministic", () => {
    const a = deterministicStoryboard(payload, script, video);
    const b = deterministicStoryboard(payload, script, video);
    expect(a).toEqual(b);
    expect(a.shots.length).toBeLessThanOrEqual(video.max_clips);
    expect(a.shots.length).toBeGreaterThan(0);
    expect(a.totalSeconds).toBe(a.shots.length * video.clip_seconds);
    // first shot illustrates the headline fact
    expect(a.shots[0]!.scene).toContain(payload.headlineFact);
  });
});
