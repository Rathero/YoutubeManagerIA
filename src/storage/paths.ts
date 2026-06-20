import { join } from "node:path";

/** Root for all generated artifacts (media, payloads, run records). Overridable. */
export function dataRoot(): string {
  return process.env.FACTORY_DATA_DIR ?? join(process.cwd(), "out");
}

/** Per-run working directory: out/<channelId>/<date>/ */
export function runDir(channelId: string, date: string): string {
  return join(dataRoot(), channelId, date);
}

/** Where the lightweight JSON DB lives. */
export function dbDir(): string {
  return join(dataRoot(), "_db");
}
