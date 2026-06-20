import type { ContentPayload } from "../core/types/index.js";
import type { RunRecord, Store } from "./store.js";

/**
 * Postgres-backed Store (M4). Uses `pg` via a lazy dynamic import so the dependency is
 * only required when FACTORY_STORE=postgres. Falls in behind the same interface as the
 * JSON store; switching is a config/env change, not a code change.
 */
export class PostgresStore implements Store {
  private pool: any;
  private ready: Promise<void>;

  constructor(connectionString = process.env.DATABASE_URL) {
    if (!connectionString) throw new Error("PostgresStore: DATABASE_URL not set");
    this.ready = this.init(connectionString);
  }

  private async init(connectionString: string): Promise<void> {
    const pg = await import("pg").catch(() => {
      throw new Error('PostgresStore: "pg" is not installed. Run `npm i pg`.');
    });
    this.pool = new pg.default.Pool({ connectionString });
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS runs (
        run_id text PRIMARY KEY,
        channel_id text NOT NULL,
        date text NOT NULL,
        status text NOT NULL,
        reason text,
        stages jsonb NOT NULL DEFAULT '[]',
        publications jsonb NOT NULL DEFAULT '[]',
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS runs_channel_date ON runs (channel_id, date);
      CREATE TABLE IF NOT EXISTS payloads (
        channel_id text NOT NULL,
        date text NOT NULL,
        payload jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (channel_id, date)
      );
    `);
  }

  async saveRun(r: RunRecord): Promise<void> {
    await this.ready;
    await this.pool.query(
      `INSERT INTO runs (run_id, channel_id, date, status, reason, stages, publications, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (run_id) DO UPDATE SET status=$4, reason=$5, stages=$6, publications=$7`,
      [r.runId, r.channelId, r.date, r.status, r.reason ?? null, JSON.stringify(r.stages), JSON.stringify(r.publications), r.createdAt],
    );
  }

  async savePayload(channelId: string, date: string, payload: ContentPayload): Promise<void> {
    await this.ready;
    await this.pool.query(
      `INSERT INTO payloads (channel_id, date, payload) VALUES ($1,$2,$3)
       ON CONFLICT (channel_id, date) DO UPDATE SET payload=$3`,
      [channelId, date, JSON.stringify(payload)],
    );
  }

  async getRun(runId: string): Promise<RunRecord | null> {
    await this.ready;
    const res = await this.pool.query("SELECT * FROM runs WHERE run_id=$1", [runId]);
    const row = res.rows[0];
    if (!row) return null;
    return {
      runId: row.run_id,
      channelId: row.channel_id,
      date: row.date,
      status: row.status,
      reason: row.reason ?? undefined,
      stages: row.stages,
      publications: row.publications,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  async isPublished(channelId: string, date: string, format: string, platform: string): Promise<boolean> {
    await this.ready;
    const res = await this.pool.query(
      `SELECT 1 FROM runs WHERE channel_id=$1 AND date=$2
       AND publications @> $3::jsonb LIMIT 1`,
      [channelId, date, JSON.stringify([{ format, platform, status: "published" }])],
    );
    return res.rowCount > 0;
  }
}
