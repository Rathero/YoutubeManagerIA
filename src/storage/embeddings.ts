import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resilientFetch } from "../core/util/fetch.js";
import { dbDir } from "./paths.js";

/** Cosine similarity of two equal-length vectors. */
export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

/** Semantic dedup is opt-in (needs a model). */
export function embeddingsEnabled(): boolean {
  return process.env.FACTORY_EMBED === "1";
}

function provider(): { base: string; key: string; model: string } | null {
  const openai = process.env.OPENAI_API_KEY ?? "";
  const base = process.env.FACTORY_EMBED_URL ?? (openai ? "https://api.openai.com/v1" : "");
  if (!base) return null;
  return { base, key: base.includes("openai.com") ? openai : "local", model: process.env.FACTORY_EMBED_MODEL ?? "text-embedding-3-small" };
}

/** Embed text (cached on disk by hash). Returns null when no provider is configured. */
export async function embed(text: string): Promise<number[] | null> {
  const p = provider();
  if (!p) return null;
  const key = createHash("sha256").update(`${p.model} ${text}`).digest("hex").slice(0, 24);
  const file = join(dbDir(), "embcache", `${key}.json`);
  try {
    return JSON.parse(await readFile(file, "utf8")) as number[];
  } catch {
    /* miss */
  }
  try {
    const res = await resilientFetch(`${p.base}/embeddings`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${p.key}` },
      body: JSON.stringify({ model: p.model, input: text }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: Array<{ embedding: number[] }> };
    const vec = json.data?.[0]?.embedding;
    if (!vec) return null;
    await mkdir(join(dbDir(), "embcache"), { recursive: true });
    await writeFile(file, JSON.stringify(vec));
    return vec;
  } catch {
    return null;
  }
}

/** Find a recent headline that is semantically near-duplicate (cosine >= threshold). */
export async function semanticNearDuplicate(
  headline: string,
  recent: string[],
  threshold = 0.86,
): Promise<{ match: string; score: number } | null> {
  const h = await embed(headline);
  if (!h) return null;
  let best: { match: string; score: number } | null = null;
  for (const r of recent.slice(0, 20)) {
    const v = await embed(r);
    if (!v) continue;
    const score = Math.round(cosine(h, v) * 100) / 100;
    if (score >= threshold && (!best || score > best.score)) best = { match: r, score };
  }
  return best;
}
