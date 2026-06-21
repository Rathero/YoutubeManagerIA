import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { loadChannelDefinition } from "../config/loader.js";
import { optimizeChannel } from "./optimize.js";
import type { PublicationMetric } from "./index.js";

const luz = await loadChannelDefinition(resolve(process.cwd(), "src/config/luz-es.yaml"));

describe("optimizeChannel (close the loop)", () => {
  it("tunes publish times to the best hour", () => {
    const metrics: PublicationMetric[] = [
      ...Array.from({ length: 6 }, (_, i) => ({ channelId: "luz-es", date: `d${i}`, platform: "youtube", format: "short", publishHour: 9, views: 6000 })),
      ...Array.from({ length: 6 }, (_, i) => ({ channelId: "luz-es", date: `e${i}`, platform: "youtube", format: "short", publishHour: 21, views: 1500 })),
    ];
    const { channel, changes } = optimizeChannel(luz, metrics);
    expect(changes.length).toBe(1);
    expect(changes[0]).toContain("09:00");
    expect(channel.platforms[0]!.publish_times.short).toBe("09:00");
  });

  it("does nothing without enough data", () => {
    expect(optimizeChannel(luz, []).changes).toEqual([]);
  });
});
