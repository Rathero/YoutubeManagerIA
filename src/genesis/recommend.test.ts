import { describe, expect, it } from "vitest";
import { heuristicRecommendation } from "./recommend.js";

describe("heuristicRecommendation (no-code strategy guidance)", () => {
  it("routes data topics to the http adapter + data_card", () => {
    const r = heuristicRecommendation("precio del gasóleo en España");
    expect(r.contentKind).toBe("data");
    expect(r.adapter).toBe("http");
    expect(r.videoMode).toBe("data_card");
  });

  it("routes story topics to generative + cinematic", () => {
    const r = heuristicRecommendation("leyendas y mitos de la antigua Grecia");
    expect(r.contentKind).toBe("story");
    expect(r.adapter).toBe("generative");
    expect(r.videoMode).toBe("generative");
    expect(r.style).toBe("cinematic");
  });

  it("picks anime style when the topic implies it", () => {
    expect(heuristicRecommendation("retos y curiosidades del mundo anime").style).toBe("anime");
  });

  it("routes generic knowledge to generative + realistic", () => {
    const r = heuristicRecommendation("trucos de productividad para el trabajo");
    expect(r.contentKind).toBe("knowledge");
    expect(r.adapter).toBe("generative");
    expect(r.style).toBe("realistic");
  });

  it("is deterministic", () => {
    expect(heuristicRecommendation("historia de Roma")).toEqual(heuristicRecommendation("historia de Roma"));
  });
});
