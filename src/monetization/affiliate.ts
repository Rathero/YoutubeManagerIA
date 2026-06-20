import type { ContentPayload } from "../core/types/index.js";

/** Append UTM tracking params to an affiliate URL. */
export function buildUtmUrl(
  baseUrl: string,
  params: { source: string; campaign: string; content: string; medium?: string },
): string {
  try {
    const u = new URL(baseUrl);
    u.searchParams.set("utm_source", params.source);
    u.searchParams.set("utm_medium", params.medium ?? "video");
    u.searchParams.set("utm_campaign", params.campaign);
    u.searchParams.set("utm_content", params.content);
    return u.toString();
  } catch {
    return baseUrl;
  }
}

/**
 * Pick the affiliate link whose vertical best matches the day's content, so the link is
 * contextual (e.g. a "baterías" day surfaces the battery link). Falls back to the first.
 */
export function pickAffiliate(
  payload: ContentPayload,
  links: Record<string, string>,
): { vertical: string; url: string } | null {
  const entries = Object.entries(links);
  if (entries.length === 0) return null;

  const hay = [
    payload.headlineFact,
    payload.context ?? "",
    ...payload.segments.map((s) => `${s.title} ${s.detail}`),
    ...(payload.recommendation?.items ?? []).map((i) => i.label),
  ]
    .join(" ")
    .toLowerCase();

  let best: { vertical: string; url: string; score: number } | null = null;
  for (const [vertical, url] of entries) {
    const words = vertical.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    const score = words.reduce((n, w) => n + (hay.includes(w) ? 1 : 0), 0);
    if (!best || score > best.score) best = { vertical, url, score };
  }
  const chosen = best && best.score > 0 ? best : { vertical: entries[0]![0], url: entries[0]![1] };
  return { vertical: chosen.vertical, url: chosen.url };
}

/** Contextual affiliate link with UTM for a given run, or null when none configured. */
export function affiliateForRun(
  payload: ContentPayload,
  links: Record<string, string>,
  ctx: { channelId: string; date: string; source: string },
): { vertical: string; url: string } | null {
  const picked = pickAffiliate(payload, links);
  if (!picked) return null;
  return {
    vertical: picked.vertical,
    url: buildUtmUrl(picked.url, { source: ctx.source, campaign: ctx.channelId, content: ctx.date }),
  };
}
