import type { ChannelDefinition } from "../core/types/index.js";
import { createLogger } from "../ops/logger.js";
import { tryRun } from "./trigger.js";

/**
 * BullMQ worker (M4). Each channel gets a repeatable job; the processor evaluates the
 * trigger (data-gate / cron) and runs a cycle when due. Per-channel isolation (one
 * failing channel never tumbles the others) + idempotency (publish stage + store) make
 * repeats safe. Uses lazy imports so bullmq/ioredis are only needed when you run a worker.
 */
export interface WorkerHandle {
  stop: () => Promise<void>;
}

export async function startWorker(channels: ChannelDefinition[]): Promise<WorkerHandle> {
  const log = createLogger({ component: "worker" });
  const url = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

  const bullmq = await import("bullmq").catch(() => {
    throw new Error('worker: "bullmq" is not installed. Run `npm i bullmq ioredis`.');
  });
  const ioredisMod: any = await import("ioredis");
  const IORedis = ioredisMod.default ?? ioredisMod;
  const connection = new IORedis(url, { maxRetriesPerRequest: null });

  const queueName = "channel-factory";
  const queue = new bullmq.Queue(queueName, { connection });
  const byId = new Map(channels.map((c) => [c.id, c]));

  // Schedule one repeatable tick per active channel.
  for (const channel of channels) {
    if (channel.status !== "active") continue;
    const everyMin = channel.schedule.trigger.retry_every_min ?? 30;
    await queue.add(
      "tick",
      { channelId: channel.id },
      {
        jobId: `tick:${channel.id}`,
        repeat: { every: everyMin * 60 * 1000 },
        removeOnComplete: 50,
        removeOnFail: 50,
      },
    );
    log("info", "scheduled channel", { channelId: channel.id, everyMin });
  }

  const worker = new bullmq.Worker(
    queueName,
    async (job: any) => {
      const channel = byId.get(job.data.channelId);
      if (!channel) return { skipped: "unknown channel" };
      const result = await tryRun(channel, new Date());
      if (!result.fired) {
        log("info", "tick not fired", { channelId: channel.id, reason: result.reason });
        return { fired: false, reason: result.reason };
      }
      log("info", "tick fired", { channelId: channel.id, status: result.outcome?.status });
      return { fired: true, status: result.outcome?.status };
    },
    { connection, concurrency: Number(process.env.FACTORY_WORKER_CONCURRENCY ?? 2) },
  );

  worker.on("failed", (job: any, err: Error) => log("error", "job failed", { jobId: job?.id, error: err.message }));

  log("info", "worker started", { url, channels: channels.length });
  return {
    stop: async () => {
      await worker.close();
      await queue.close();
      await connection.quit();
    },
  };
}
