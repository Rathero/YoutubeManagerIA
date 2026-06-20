import { resolve } from "node:path";
import type { NicheAdapter } from "../_interface.js";
import type { ContentPayload, RawData, RunContext } from "../../core/types/index.js";
import { analyzeLuz } from "./analyze.js";
import { fetchLuz } from "./fetch.js";
import type { ApplianceConfig, LuzConfig, LuzRawData } from "./types.js";

function parseConfig(ctx: RunContext): LuzConfig {
  const c = (ctx.channel.data.config ?? {}) as Record<string, unknown>;
  const source = (c.source as LuzConfig["source"]) ?? "preciodelaluz";
  const fixturePath = c.fixturePath
    ? resolve(process.cwd(), String(c.fixturePath))
    : undefined;
  return {
    source,
    zone: String(c.zone ?? "PCB"),
    appliances: (c.appliances as ApplianceConfig[]) ?? [],
    fixturePath,
    baselineEurKwh: c.baselineEurKwh !== undefined ? Number(c.baselineEurKwh) : undefined,
  };
}

/**
 * The `luz` adapter: Spanish regulated-tariff (PVPC) daily electricity price.
 * Implements the NicheAdapter contract; everything domain-specific lives here.
 */
class LuzAdapter implements NicheAdapter {
  readonly key = "luz";

  async isReady(ctx: RunContext): Promise<{ ready: boolean; reason?: string }> {
    const config = parseConfig(ctx);
    try {
      const raw = await fetchLuz(config);
      // Tomorrow's day-ahead series is the freshness signal.
      const ready = Boolean(raw.tomorrow && raw.tomorrow.hours.length >= 20);
      return ready
        ? { ready: true }
        : { ready: false, reason: "tomorrow day-ahead series not published yet" };
    } catch (err) {
      return { ready: false, reason: `fetch failed: ${(err as Error).message}` };
    }
  }

  async fetch(ctx: RunContext): Promise<RawData> {
    return fetchLuz(parseConfig(ctx));
  }

  async analyze(raw: RawData, ctx: RunContext): Promise<ContentPayload> {
    const config = parseConfig(ctx);
    return analyzeLuz(raw as LuzRawData, ctx.channel.id, config.appliances, config.baselineEurKwh);
  }
}

export function createLuzAdapter(): NicheAdapter {
  return new LuzAdapter();
}
