import { randomUUID } from "node:crypto";
import { getAdapter } from "../adapters/registry.js";
import { Orchestrator, type RunOutcome } from "../core/orchestrator/orchestrator.js";
import type { ChannelDefinition, RunContext } from "../core/types/index.js";
import { createLogger } from "../ops/logger.js";
import { notifyRunOutcome } from "../ops/notify.js";
import { toRunRecord, type Store } from "../storage/store.js";
import { getStore } from "../storage/index.js";
import { resolveLlmClient } from "./llm/client.js";
import { withLlmCache } from "./llm/cache.js";
import { createIngestStage } from "./ingest/index.js";
import { createComputeStage } from "./compute/index.js";
import { createScriptStage } from "./script/index.js";
import { createVoiceStage } from "./voice/index.js";
import { createCaptionsStage } from "./captions/index.js";
import { createModerationStage } from "./moderation/index.js";
import { createRenderStage } from "./render/index.js";
import { createThumbnailStage } from "./thumbnail/index.js";
import { createMetadataStage } from "./metadata/index.js";
import { createQaStage } from "./qa/index.js";
import { createPublishStage } from "./publish/index.js";
import { createRecordStage } from "./record/index.js";

export interface RunOptions {
  date?: string; // ISO YYYY-MM-DD; defaults to today
  now?: Date;
  dryRun?: boolean;
  store?: Store;
}

function isoToday(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Assembles the full Engine pipeline for a channel and runs one cycle.
 * The stage list IS the pipeline from section 6 of the brief, in order.
 */
export async function runChannel(channel: ChannelDefinition, opts: RunOptions = {}): Promise<RunOutcome> {
  const now = opts.now ?? new Date();
  const date = opts.date ?? isoToday(now);
  const store = opts.store ?? (await getStore());
  const adapter = getAdapter(channel.data.adapter);
  const llm = withLlmCache(await resolveLlmClient(channel.script.provider));

  const ctx: RunContext = {
    runId: randomUUID(),
    channel,
    date,
    now,
    dryRun: opts.dryRun ?? false,
    stageRecords: [],
    log: createLogger({ runId: "run", channelId: channel.id, date }),
    llm,
  };

  const orchestrator = new Orchestrator([
    createIngestStage(adapter),
    createComputeStage(adapter),
    createScriptStage(llm),
    createModerationStage(),
    createVoiceStage(),
    createCaptionsStage(),
    createRenderStage(llm),
    createThumbnailStage(),
    createMetadataStage(),
    createQaStage(),
    createPublishStage(store),
    createRecordStage(store),
  ]);

  const outcome = await orchestrator.run(ctx);

  // Persist a record even on skip/failure for traceability.
  if (outcome.status === "skipped") {
    await store.saveRun(toRunRecord(ctx, "skipped", outcome.reason));
  } else if (outcome.status === "failed") {
    await store.saveRun(toRunRecord(ctx, "failed", outcome.error.message));
  }

  // Ops alert (no-op without a webhook/token).
  const detail =
    outcome.status === "completed"
      ? `${(ctx.publications ?? []).filter((p) => p.status === "published" || p.status === "queued_assisted").length} salida(s)`
      : outcome.status === "failed"
        ? `${outcome.stage}: ${outcome.error.message}`
        : (outcome as any).reason ?? "";
  await notifyRunOutcome({ channelId: channel.id, date, status: outcome.status, detail }).catch(() => undefined);

  return outcome;
}
