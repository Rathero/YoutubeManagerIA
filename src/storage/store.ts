import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  ContentPayload,
  PublishResult,
  RunContext,
  StageRecord,
} from "../core/types/index.js";
import { dbDir } from "./paths.js";

/**
 * Storage contract. The MVP ships a file-backed JSON store; swap for Postgres
 * (Prisma/Drizzle) later without touching callers. Tables from the brief map to
 * the record shapes below: runs, payloads, publications.
 */
export interface RunRecord {
  runId: string;
  channelId: string;
  date: string;
  status: "completed" | "skipped" | "failed";
  reason?: string;
  stages: StageRecord[];
  publications: PublishResult[];
  createdAt: string;
}

export interface Store {
  saveRun(record: RunRecord): Promise<void>;
  savePayload(channelId: string, date: string, payload: ContentPayload): Promise<void>;
  getRun(runId: string): Promise<RunRecord | null>;
  /** Idempotency: has (channel,date,format,platform) already been published? */
  isPublished(channelId: string, date: string, format: string, platform: string): Promise<boolean>;
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

export class JsonStore implements Store {
  private dir = dbDir();

  private async ensure() {
    await mkdir(join(this.dir, "runs"), { recursive: true });
    await mkdir(join(this.dir, "payloads"), { recursive: true });
  }

  async saveRun(record: RunRecord): Promise<void> {
    await this.ensure();
    await writeFile(join(this.dir, "runs", `${record.runId}.json`), JSON.stringify(record, null, 2));
  }

  async savePayload(channelId: string, date: string, payload: ContentPayload): Promise<void> {
    await this.ensure();
    await writeFile(
      join(this.dir, "payloads", `${channelId}_${date}.json`),
      JSON.stringify(payload, null, 2),
    );
  }

  async getRun(runId: string): Promise<RunRecord | null> {
    return readJson<RunRecord>(join(this.dir, "runs", `${runId}.json`));
  }

  async isPublished(
    channelId: string,
    date: string,
    format: string,
    platform: string,
  ): Promise<boolean> {
    // Scan recorded runs for a prior successful publication of this exact key.
    // Small-scale MVP behavior; a Postgres store would do this with an index.
    const runsDir = join(this.dir, "runs");
    let files: string[];
    try {
      files = await readdir(runsDir);
    } catch {
      return false;
    }
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const rec = await readJson<RunRecord>(join(runsDir, file));
      if (!rec || rec.channelId !== channelId || rec.date !== date) continue;
      if (
        rec.publications.some(
          (p) => p.format === format && p.platform === platform && p.status === "published",
        )
      ) {
        return true;
      }
    }
    return false;
  }
}

/** Build the canonical RunRecord from a finished RunContext. */
export function toRunRecord(
  ctx: RunContext,
  status: RunRecord["status"],
  reason?: string,
): RunRecord {
  return {
    runId: ctx.runId,
    channelId: ctx.channel.id,
    date: ctx.date,
    status,
    reason,
    stages: ctx.stageRecords,
    publications: ctx.publications ?? [],
    createdAt: new Date().toISOString(),
  };
}
