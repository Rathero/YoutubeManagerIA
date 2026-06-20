import type { Publisher } from "../_interface.js";
import type { PublishResult } from "../../core/types/index.js";
import { enqueueAssisted } from "../assisted-queue.js";

/**
 * Instagram publisher (Graph API, Reels). Requires a Business/Creator account linked
 * to a Facebook Page and an approved app (container → publish, 24h limits). The MVP
 * defaults to the assisted queue; wire the Graph API container/publish flow here when
 * the app permissions are granted, keeping the same Publisher interface.
 */
export class InstagramPublisher implements Publisher {
  readonly platform = "instagram" as const;
  async publish(input: any): Promise<PublishResult> {
    if (input.dryRun) return { platform: "instagram", format: input.meta.format, status: "skipped", message: "dry-run" };
    const queuedItemPath = await enqueueAssisted(input.channelId, input.date, input.asset, input.meta);
    return {
      platform: "instagram",
      format: input.meta.format,
      status: "queued_assisted",
      queuedItemPath,
      message: "IG Reels publishing needs an approved app; queued for one-tap publish",
    };
  }
}

export function createInstagramPublisher(): Publisher {
  return new InstagramPublisher();
}
