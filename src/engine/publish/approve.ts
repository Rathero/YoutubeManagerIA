import type { PublishResult } from "../../core/types/index.js";
import { getPublisher } from "../../distribution/registry.js";
import { deletePending, loadPending } from "../../storage/pending.js";

/** Publish a previously-held (pending) run after human approval. */
export async function approvePending(channelId: string, date: string): Promise<PublishResult[]> {
  const rec = await loadPending(channelId, date);
  if (!rec) throw new Error(`no pending para ${channelId} ${date}`);
  const results: PublishResult[] = [];
  for (const item of rec.items) {
    const publisher = getPublisher(item.platform);
    const res = await publisher.publish({
      channelId,
      date,
      asset: item.asset as any,
      meta: item.meta as any,
      account: { ref: item.accountRef, mode: item.mode },
      dryRun: false,
    });
    results.push(res);
  }
  await deletePending(channelId, date);
  return results;
}

/** Discard a pending run. */
export async function rejectPending(channelId: string, date: string): Promise<void> {
  await deletePending(channelId, date);
}
