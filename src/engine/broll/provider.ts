import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ContentPayload } from "../../core/types/index.js";

const STOP = new Set(["mañana", "hoy", "para", "como", "este", "esta", "más", "con", "los", "las", "del", "que", "una", "the", "and", "for", "with"]);

/** Build a short search query for stock footage from the day's content + topic. */
export function brollQuery(payload: ContentPayload, topic: string): string {
  const words = `${topic}`
    .toLowerCase()
    .replace(/[^a-záéíóúñ0-9 ]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length > 4 && !STOP.has(w));
  // Prefer the topic's salient nouns; fall back to the headline.
  const base = words.slice(0, 2);
  if (base.length === 0) {
    const h = payload.headlineFact.toLowerCase().split(/\s+/).filter((w) => w.length > 4 && !STOP.has(w));
    return h.slice(0, 2).join(" ") || "abstract background";
  }
  return base.join(" ");
}

export interface BrollProvider {
  readonly name: string;
  available(): boolean;
  /** Return a downloadable mp4 URL for the query, or null. */
  search(query: string): Promise<string | null>;
}

export class PexelsBroll implements BrollProvider {
  readonly name = "pexels";
  private key = process.env.PEXELS_API_KEY ?? "";
  available(): boolean {
    return this.key.length > 0;
  }
  async search(query: string): Promise<string | null> {
    const res = await fetch(`https://api.pexels.com/videos/search?per_page=1&orientation=portrait&query=${encodeURIComponent(query)}`, {
      headers: { authorization: this.key },
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { videos?: Array<{ video_files?: Array<{ link: string; height: number }> }> };
    const files = j.videos?.[0]?.video_files ?? [];
    const best = files.sort((a, b) => (a.height ?? 0) - (b.height ?? 0)).find((f) => (f.height ?? 0) >= 720) ?? files[0];
    return best?.link ?? null;
  }
}

export class PixabayBroll implements BrollProvider {
  readonly name = "pixabay";
  private key = process.env.PIXABAY_API_KEY ?? "";
  available(): boolean {
    return this.key.length > 0;
  }
  async search(query: string): Promise<string | null> {
    const res = await fetch(`https://pixabay.com/api/videos/?key=${this.key}&per_page=3&q=${encodeURIComponent(query)}`);
    if (!res.ok) return null;
    const j = (await res.json()) as { hits?: Array<{ videos?: { medium?: { url: string }; large?: { url: string } } }> };
    const v = j.hits?.[0]?.videos;
    return v?.large?.url ?? v?.medium?.url ?? null;
  }
}

export function getBrollProvider(name: string): BrollProvider | null {
  const p = name === "pexels" ? new PexelsBroll() : name === "pixabay" ? new PixabayBroll() : null;
  return p && p.available() ? p : null;
}

/** Fetch + download one b-roll clip for the query. Returns the local path or null. */
export async function fetchBroll(provider: BrollProvider, query: string, outPath: string): Promise<string | null> {
  try {
    const url = await provider.search(query);
    if (!url) return null;
    const res = await fetch(url);
    if (!res.ok) return null;
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, Buffer.from(await res.arrayBuffer()));
    return outPath;
  } catch {
    return null;
  }
}
