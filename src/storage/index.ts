import { JsonStore, type Store } from "./store.js";

export * from "./store.js";

/**
 * Store selector. FACTORY_STORE=postgres uses the Postgres store (requires DATABASE_URL
 * and the `pg` package); anything else uses the file-backed JSON store. Default = json.
 */
export async function getStore(): Promise<Store> {
  if ((process.env.FACTORY_STORE ?? "json").toLowerCase() === "postgres") {
    const { PostgresStore } = await import("./postgres-store.js");
    return new PostgresStore();
  }
  return new JsonStore();
}
