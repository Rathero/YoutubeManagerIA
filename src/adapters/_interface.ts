import type { ContentPayload, RawData, RunContext } from "../core/types/index.js";

/**
 * NicheAdapter — the ONLY domain-specific code written per channel.
 *
 * It answers three questions for the engine:
 *  1. isReady  — is there fresh data for this cycle? (freshness gate)
 *  2. fetch    — pull raw data from the source(s)
 *  3. analyze  — DETERMINISTIC domain logic → normalized ContentPayload
 *
 * The engine consumes the ContentPayload and never sees domain specifics.
 */
export interface NicheAdapter {
  /** Stable key, matches ChannelDefinition.data.adapter. */
  readonly key: string;

  isReady(ctx: RunContext): Promise<{ ready: boolean; reason?: string }>;
  fetch(ctx: RunContext): Promise<RawData>;
  analyze(raw: RawData, ctx: RunContext): Promise<ContentPayload>;
}

export type AdapterFactory = () => NicheAdapter;
