import type { Publisher } from "../_interface.js";
import type { PublishResult } from "../../core/types/index.js";
import { enqueueAssisted } from "../assisted-queue.js";

/**
 * TikTok publisher. Direct-post via the Content Posting API requires an audited app;
 * until then the supported path is draft/inbox (manual publish). The MVP therefore
 * defaults to the assisted queue. Set mode=auto once the app is approved and wire
 * the Content Posting API here behind the same interface.
 */
export class TikTokPublisher implements Publisher {
  readonly platform = "tiktok" as const;
  async publish(input: any): Promise<PublishResult> {
    if (input.dryRun) return { platform: "tiktok", format: input.meta.format, status: "skipped", message: "dry-run" };
    const queuedItemPath = await enqueueAssisted(input.channelId, input.date, input.asset, input.meta);
    return {
      platform: "tiktok",
      format: input.meta.format,
      status: "queued_assisted",
      queuedItemPath,
      message: "TikTok direct-post needs an audited app; queued for one-tap publish",
    };
  }
}

export function createTikTokPublisher(): Publisher {
  return new TikTokPublisher();
}
