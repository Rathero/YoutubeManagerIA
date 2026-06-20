import { describe, expect, it } from "vitest";
import { buildPostText } from "./index.js";
import type { PlatformMeta } from "../../core/types/index.js";

const meta: PlatformMeta = {
  platform: "x",
  format: "short",
  title: "Mañana la luz baja un 18%",
  description: "...",
  hashtags: ["#luz", "#ahorro", "#PVPC", "#extra"],
  extra: { link: "https://youtu.be/abc" },
};

describe("cross-post text", () => {
  it("includes title, link and up to 3 hashtags", () => {
    const t = buildPostText(meta, 280);
    expect(t).toContain("Mañana la luz baja un 18%");
    expect(t).toContain("https://youtu.be/abc");
    expect(t).toContain("#luz");
    expect(t).not.toContain("#extra"); // capped at 3 tags
  });

  it("clamps to the platform char limit", () => {
    const long = { ...meta, title: "x".repeat(500) };
    expect(buildPostText(long, 280).length).toBeLessThanOrEqual(280);
  });
});
