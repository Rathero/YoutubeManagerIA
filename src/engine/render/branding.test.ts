import { describe, expect, it } from "vitest";
import { overlayXY, watermarkFilter, brandingActive } from "./branding.js";

describe("branding watermark geometry", () => {
  it("places each corner with the margin", () => {
    expect(overlayXY("top-left", 40)).toBe("40:40");
    expect(overlayXY("top-right", 40)).toBe("main_w-overlay_w-40:40");
    expect(overlayXY("bottom-left", 24)).toBe("24:main_h-overlay_h-24");
    expect(overlayXY("bottom-right", 24)).toBe("main_w-overlay_w-24:main_h-overlay_h-24");
  });

  it("builds a scale+opacity+overlay filter graph", () => {
    const f = watermarkFilter("top-right", 0.12, 0.8, 40);
    expect(f).toContain("scale=iw*0.12:-1");
    expect(f).toContain("colorchannelmixer=aa=0.8");
    expect(f).toContain("overlay=main_w-overlay_w-40:40");
  });

  it("clamps out-of-range scale and opacity", () => {
    const f = watermarkFilter("top-left", 5, 9, 0);
    expect(f).toContain("scale=iw*1:-1");
    expect(f).toContain("aa=1");
  });
});

describe("brandingActive", () => {
  it("is false when nothing is configured", () => {
    expect(brandingActive(undefined)).toBe(false);
    expect(
      brandingActive({ watermark: { enabled: false, position: "top-right", scale: 0.1, opacity: 0.8, margin: 40 } }),
    ).toBe(false);
  });

  it("is true with an intro, outro, or enabled watermark", () => {
    const wm = { enabled: false, position: "top-right" as const, scale: 0.1, opacity: 0.8, margin: 40 };
    expect(brandingActive({ intro: "i.mp4", watermark: wm })).toBe(true);
    expect(brandingActive({ outro: "o.mp4", watermark: wm })).toBe(true);
    expect(brandingActive({ watermark: { ...wm, enabled: true, path: "logo.png" } })).toBe(true);
  });
});
