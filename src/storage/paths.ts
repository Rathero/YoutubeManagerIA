import { join } from "node:path";

/**
 * Tenant scoping — the SaaS primitive. When FACTORY_TENANT is set, all generated data
 * and (optionally) channel configs are isolated per tenant. Unset = single-tenant
 * (backwards compatible: no extra subfolder).
 */
export function tenant(): string {
  return process.env.FACTORY_TENANT ?? "";
}

/** Root for all generated artifacts (media, payloads, run records). Tenant-scoped. */
export function dataRoot(): string {
  const base = process.env.FACTORY_DATA_DIR ?? join(process.cwd(), "out");
  return tenant() ? join(base, "_tenants", tenant()) : base;
}

/** Per-run working directory: <dataRoot>/<channelId>/<date>/ */
export function runDir(channelId: string, date: string): string {
  return join(dataRoot(), channelId, date);
}

/** Where the lightweight JSON DB lives. */
export function dbDir(): string {
  return join(dataRoot(), "_db");
}

/** Channel-config directory: tenant override (tenants/<t>/config) or src/config. */
export function configDir(): string {
  const t = tenant();
  if (t) return join(process.cwd(), "tenants", t, "config");
  return join(process.cwd(), "src", "config");
}
