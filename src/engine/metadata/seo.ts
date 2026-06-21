import type { ChannelDefinition, ContentPayload } from "../../core/types/index.js";

const STOPWORDS = new Set([
  "the", "and", "for", "que", "con", "los", "las", "del", "una", "uno", "por", "para", "como",
  "más", "mas", "este", "esta", "esto", "son", "han", "hoy", "muy", "sus", "tus", "ese", "esa",
  "the", "a", "an", "of", "to", "in", "on", "is", "it", "de", "la", "el", "en", "un", "y", "se",
  "su", "al", "lo", "no", "si", "ya", "o", "u",
]);

function normalizeWord(w: string): string {
  return w
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9áéíóúñ]/gi, "")
    .toLowerCase();
}

/**
 * SEO keyword tags for the YouTube `tags` field (plain keywords, NOT #hashtags). Built from
 * the niche topic/keywords plus the most salient words in the headline + metric labels. Pure,
 * deterministic, deduped, capped to YouTube's ~500-char budget. Unit tested.
 */
export function seoTags(channel: ChannelDefinition, payload: ContentPayload, limit = 15): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const t = raw.trim();
    const key = normalizeWord(t.replace(/\s+/g, ""));
    if (!t || key.length < 3 || seen.has(key)) return;
    seen.add(key);
    out.push(t.toLowerCase());
  };

  // 1) Curated, high-intent terms first: topic + explicit keywords + verticals.
  push(channel.niche.topic);
  for (const k of channel.niche.keywords ?? []) push(k);
  for (const v of channel.niche.monetization.affiliate_verticals) push(v);

  // 2) Salient single words from the headline + metric labels (frequency-ranked).
  const freq = new Map<string, number>();
  const text = [payload.headlineFact, ...payload.keyMetrics.map((m) => m.label)].join(" ");
  for (const raw of text.split(/\s+/)) {
    const w = normalizeWord(raw);
    if (w.length < 4 || STOPWORDS.has(w)) continue;
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  for (const [w] of [...freq.entries()].sort((a, b) => b[1] - a[1])) push(w);

  // YouTube caps the tags field around 500 chars total; respect both count + budget.
  const capped: string[] = [];
  let budget = 0;
  for (const t of out.slice(0, limit)) {
    if (budget + t.length + 1 > 480) break;
    capped.push(t);
    budget += t.length + 1;
  }
  return capped;
}

const POWER_WORDS = [
  "secreto", "nuevo", "ahora", "gratis", "truco", "error", "cuidado", "rápido", "fácil",
  "mejor", "peor", "evita", "deja", "nunca", "siempre", "cómo", "como", "guía",
];

/**
 * Heuristic CTR score (0–100) for a candidate title. Rewards the proven levers — a length in
 * the click sweet spot, a number, a curiosity/question hook, brackets, an emoji, and power
 * words — and lightly penalizes very long titles that get truncated. Pure + unit tested so the
 * picker is explainable rather than a black box.
 */
export function scoreTitle(title: string): number {
  const t = title.trim();
  const len = t.length;
  let score = 0;
  // Length sweet spot ~ 40–60 chars for search + mobile truncation.
  if (len >= 30 && len <= 62) score += 30;
  else if (len >= 20 && len <= 75) score += 18;
  else score += 6;
  if (len > 90) score -= 8;
  if (/\d/.test(t)) score += 14; // numbers/stats
  if (/[?¿]/.test(t)) score += 14; // curiosity/question
  if (/[\[\(].+[\]\)]/.test(t)) score += 8; // [brackets] / (parens)
  if (/\p{Extended_Pictographic}/u.test(t)) score += 8; // emoji
  const lower = t.toLowerCase();
  if (POWER_WORDS.some((w) => lower.includes(w))) score += 12;
  if (t === t.toUpperCase() && /[A-Z]/.test(t)) score -= 10; // ALL CAPS = spammy
  return Math.max(0, Math.min(100, score));
}

/** Pick the highest-CTR-scoring title; ties break toward the earliest (canonical) variant. */
export function pickBestTitle<T extends { title: string }>(variants: T[]): T {
  let best = variants[0]!;
  let bestScore = scoreTitle(best.title);
  for (const v of variants.slice(1)) {
    const s = scoreTitle(v.title);
    if (s > bestScore) {
      best = v;
      bestScore = s;
    }
  }
  return best;
}
