import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { loadChannelDefinition } from "../config/loader.js";
import { proposeExperiments } from "./experiments.js";
import type { PublicationMetric } from "./index.js";

const luz = await loadChannelDefinition(resolve(process.cwd(), "src/config/luz-es.yaml"));

describe("auto-experiments", () => {
  it("covers the controllable variables", () => {
    const exps = proposeExperiments(luz, []);
    const vars = exps.map((e) => e.variable);
    expect(vars).toContain("title");
    expect(vars).toContain("publish_time");
    expect(vars).toContain("format");
    expect(vars).toContain("duration");
  });

  it("marks title 'running' when A/B is on but no data, 'concluded' with a clear winner", () => {
    expect(proposeExperiments(luz, []).find((e) => e.variable === "title")!.status).toBe("running");

    const metrics: PublicationMetric[] = [
      ...Array.from({ length: 6 }, (_, i) => ({ channelId: "luz-es", date: `d${i}`, platform: "youtube", format: "short", publishHour: 21, titleVariant: "B", views: 6000 })),
      ...Array.from({ length: 6 }, (_, i) => ({ channelId: "luz-es", date: `e${i}`, platform: "youtube", format: "short", publishHour: 21, titleVariant: "A", views: 1500 })),
    ];
    const title = proposeExperiments(luz, metrics).find((e) => e.variable === "title")!;
    expect(title.status).toBe("concluded");
    expect(title.note).toContain("B");
  });

  it("always suggests a duration test", () => {
    expect(proposeExperiments(luz, []).find((e) => e.variable === "duration")!.status).toBe("suggested");
  });
});
