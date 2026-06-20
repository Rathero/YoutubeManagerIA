import { beforeAll, describe, expect, it } from "vitest";
import type { RunContext } from "../core/types/index.js";
import { createHttpAdapter } from "./http/index.js";
import { createGenerativeAdapter } from "./generative/index.js";

/** Minimal RunContext factory for adapter unit tests. */
function ctx(partialChannel: any, date = "2026-06-21"): RunContext {
  return {
    runId: "t",
    channel: partialChannel,
    date,
    now: new Date(`${date}T20:30:00Z`),
    dryRun: true,
    stageRecords: [],
    log: () => {},
  };
}

describe("http declarative adapter (no code for data niches)", () => {
  it("maps a JSON feed to a grounded ContentPayload", async () => {
    const adapter = createHttpAdapter();
    const channel = {
      id: "demo",
      niche: { content_kind: "data" },
      data: { config: { url: "https://x", y_field: "v", x_field: "h", unit: "ºC", label: "temperatura" } },
    };
    const raw = { items: undefined, data: { items: [] } };
    // series_path omitted → top-level must be array; provide via series_path instead:
    const channel2 = {
      ...channel,
      data: { config: { ...channel.data.config, series_path: "rows" } },
    };
    const raw2 = { rows: [
      { h: 0, v: 10 },
      { h: 1, v: 4 },
      { h: 2, v: 16 },
    ] };
    const payload = await adapter.analyze(raw2, ctx(channel2));
    expect(payload.safety.factsVerified).toBe(true);
    expect(payload.keyMetrics.find((m) => m.label === "Media")?.value).toBe(10);
    expect(payload.visualData?.series).toHaveLength(3);
    // min is 4 at x=1, max is 16 at x=2
    expect(payload.keyMetrics.some((m) => String(m.label).includes("Mínimo (1)"))).toBe(true);
    void raw;
  });
});

describe("generative adapter (no code for any topic)", () => {
  beforeAll(() => {
    // Force the offline fallback path (no LLM key).
    process.env.ANTHROPIC_API_KEY = "";
    process.env.OPENAI_API_KEY = "";
    process.env.GEMINI_API_KEY = "";
    process.env.GOOGLE_API_KEY = "";
  });

  it("produces a non-empty payload from just the topic (story mode)", async () => {
    const adapter = createGenerativeAdapter();
    const channel = {
      id: "myth",
      identity: { language: "es-ES" },
      niche: { topic: "mitología nórdica", audience: "curiosos", value_proposition: "historias épicas", content_kind: "story" },
      script: { provider: { name: "auto" } },
      data: { config: { angles: ["Thor", "Loki", "Ragnarök"] } },
    };
    const seed = await adapter.fetch(ctx(channel));
    const payload = await adapter.analyze(seed, ctx(channel));
    expect(payload.headlineFact).toBeTruthy();
    expect(payload.segments.length).toBeGreaterThan(0);
    // date-based angle selection is deterministic and drawn from the configured list
    expect(["Thor", "Loki", "Ragnarök"]).toContain((seed as any).angle);
    const seed2 = await adapter.fetch(ctx(channel));
    expect((seed2 as any).angle).toBe((seed as any).angle);
  });
});
