import type { ChannelDefinition } from "../core/types/index.js";
import { getAdapter } from "../adapters/registry.js";
import { runChannel, type RunOptions } from "../engine/run.js";
import type { RunOutcome } from "../core/orchestrator/orchestrator.js";

/**
 * Scheduling — turns a ChannelDefinition.schedule.trigger into an actual run decision.
 *
 * time_with_data_gate: fire at a time, but only proceed when adapter.isReady(); retry
 * until give_up_at. This module exposes the decision logic; a host process (cron,
 * BullMQ worker, Task Scheduler) calls tryRun() on its tick. Per-channel isolation and
 * idempotency are enforced downstream (publish stage + store).
 */
export interface TickResult {
  fired: boolean;
  reason?: string;
  outcome?: RunOutcome;
}

function parseHHmm(s: string | undefined): { h: number; m: number } | null {
  if (!s) return null;
  const m = /(\d{1,2}):(\d{2})/.exec(s);
  if (!m) return null;
  return { h: Number(m[1]), m: Number(m[2]) };
}

function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** Decide whether to run on this tick, and run if appropriate. */
export async function tryRun(
  channel: ChannelDefinition,
  now: Date,
  opts: RunOptions = {},
): Promise<TickResult> {
  if (channel.status !== "active") return { fired: false, reason: `status=${channel.status}` };
  const trigger = channel.schedule.trigger;

  if (trigger.type === "event") {
    return { fired: false, reason: "event trigger: driven externally, not by tick" };
  }

  const at = parseHHmm(trigger.at);
  const giveUp = parseHHmm(trigger.give_up_at);
  const nowMin = minutesOfDay(now);

  if (at && nowMin < at.h * 60 + at.m) {
    return { fired: false, reason: "before trigger time" };
  }
  if (giveUp && nowMin > giveUp.h * 60 + giveUp.m) {
    return { fired: false, reason: "past give_up_at" };
  }

  if (trigger.type === "time_with_data_gate") {
    const adapter = getAdapter(channel.data.adapter);
    const ready = await adapter.isReady({
      channel,
      date: now.toISOString().slice(0, 10),
      now,
      runId: "probe",
      dryRun: true,
      stageRecords: [],
      log: () => {},
    });
    if (!ready.ready) return { fired: false, reason: `data gate: ${ready.reason}` };
  }

  const outcome = await runChannel(channel, { ...opts, now });
  return { fired: true, outcome };
}
