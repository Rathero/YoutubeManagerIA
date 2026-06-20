import { describe, expect, it } from "vitest";
import { screen } from "./moderation/index.js";
import { pickTitle, titleVariants } from "./metadata/index.js";
import { deriveFeedback, type PublicationMetric } from "../analytics/index.js";
import { musicMixArgs } from "./render/music.js";

describe("moderation screen", () => {
  it("flags blocklisted terms (case-insensitive)", () => {
    expect(screen("cómo MAKE A BOMB en casa", []).flagged).toBe(true);
    expect(screen("hoy hablamos de finanzas", ["estafa"]).flagged).toBe(false);
    expect(screen("esto es una Estafa clara", ["estafa"]).flagged).toBe(true);
  });
});

describe("A/B title variants", () => {
  it("offers 3 deterministic variants", () => {
    const v = titleVariants("La luz baja", "Canal", false);
    expect(v.map((x) => x.id)).toEqual(["A", "B", "C"]);
    expect(v[1]!.title.startsWith("¿")).toBe(true);
  });
  it("rotates by date when enabled, fixed when disabled", () => {
    const a = pickTitle("La luz baja", "Canal", true, "2026-06-21", true);
    const b = pickTitle("La luz baja", "Canal", true, "2026-06-22", true);
    expect(a.id === b.id).toBe(false); // different day → likely different variant
    expect(pickTitle("x", "C", true, "2026-06-21", false).id).toBe("A");
  });
});

describe("feedback: title variant attribution", () => {
  it("recommends the best title variant", () => {
    const metrics: PublicationMetric[] = [
      ...Array.from({ length: 6 }, (_, i) => ({ channelId: "c", date: `d${i}`, platform: "youtube", format: "short", publishHour: 21, titleVariant: "B", views: 5000 })),
      ...Array.from({ length: 6 }, (_, i) => ({ channelId: "c", date: `e${i}`, platform: "youtube", format: "short", publishHour: 21, titleVariant: "A", views: 1500 })),
    ];
    const sig = deriveFeedback(metrics).find((s) => s.variable === "title");
    expect(sig?.recommendation).toContain("B");
  });
});

describe("music mix args", () => {
  it("builds an ffmpeg amix command at the given volume", () => {
    const cmd = musicMixArgs("v.mp4", "bg.mp3", -22, "out.mp4");
    expect(cmd).toContain("volume=-22dB");
    expect(cmd).toContain("amix=inputs=2");
  });
});
