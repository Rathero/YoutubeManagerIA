import type { PlatformId, PlatformMeta, PublishResult, RenderedAsset } from "../core/types/index.js";

export interface AccountRef {
  /** secrets:// reference from the ChannelDefinition. */
  ref: string;
  /** auto = direct post via approved app; assisted = one-tap queue. */
  mode: "auto" | "assisted";
}

/**
 * Publisher — one implementation per platform. Must be idempotent:
 * the same (channel, date, format, platform) never publishes twice.
 */
export interface Publisher {
  readonly platform: PlatformId;
  publish(input: {
    channelId: string;
    date: string;
    asset: RenderedAsset;
    meta: PlatformMeta;
    account: AccountRef;
    dryRun: boolean;
  }): Promise<PublishResult>;
}
