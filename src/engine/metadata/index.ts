import type { Stage } from "../../core/pipeline/stage.js";
import type {
  ChannelDefinition,
  ContentPayload,
  FormatKind,
  PlatformMeta,
} from "../../core/types/index.js";
import { affiliateForRun } from "../../monetization/affiliate.js";

function slugHashtag(s: string): string {
  return (
    "#" +
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9 ]/g, "")
      .trim()
      .split(/\s+/)
      .map((w, i) => (i === 0 ? w.toLowerCase() : w[0]?.toUpperCase() + w.slice(1).toLowerCase()))
      .join("")
  );
}

function dayIndexFromIso(date: string): number {
  const t = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(t) ? Math.floor(t / 86400000) : 0;
}

/** Deterministic title variants for A/B rotation. */
export function titleVariants(headline: string, channelName: string, isShort: boolean): { id: string; title: string }[] {
  const suffix = isShort ? " #shorts" : ` | ${channelName}`;
  const q = headline.replace(/[.!]$/, "");
  return [
    { id: "A", title: `${headline}${suffix}` },
    { id: "B", title: `¿${q}?${suffix}` },
    { id: "C", title: `${headline} 👀${suffix}` },
  ];
}

/** Pick a title variant for this run (rotates by date when A/B is on). */
export function pickTitle(
  headline: string,
  channelName: string,
  isShort: boolean,
  date: string,
  abEnabled: boolean,
): { id: string; title: string } {
  const variants = titleVariants(headline, channelName, isShort);
  const idx = abEnabled ? dayIndexFromIso(date) % variants.length : 0;
  return variants[idx]!;
}

function baseHashtags(channel: ChannelDefinition): string[] {
  const tags = new Set<string>();
  tags.add(slugHashtag(channel.identity.name));
  for (const w of channel.niche.topic.split(/[\s,]+/).slice(0, 3)) {
    if (w.length > 3) tags.add(slugHashtag(w));
  }
  for (const v of channel.niche.monetization.affiliate_verticals.slice(0, 2)) {
    tags.add(slugHashtag(v));
  }
  return [...tags].filter((t) => t.length > 2);
}

/** Platform-native title/description/hashtags from the (already-factual) payload. */
function buildMeta(
  channel: ChannelDefinition,
  payload: ContentPayload,
  platform: PlatformMeta["platform"],
  format: FormatKind,
  date: string,
): PlatformMeta {
  const base = baseHashtags(channel);
  const cta = payload.cta ?? "";
  const source = payload.sourceRef.url ? `\n\nFuente: ${payload.sourceRef.name} (${payload.sourceRef.url})` : "";
  const aiDisclosure = "\n\nContenido con voz/edición generada por IA.";

  if (platform === "youtube") {
    // SEO-leaning title with A/B variant rotation.
    const variant = pickTitle(payload.headlineFact, channel.identity.name, format === "short", date, channel.ab_testing.titles);
    const title = variant.title;
    const metricsLines = payload.keyMetrics.map((m) => `• ${m.label}: ${m.value}${m.unit ? " " + m.unit : ""}`);
    const description = [
      payload.headlineFact,
      "",
      ...metricsLines,
      payload.recommendation ? `\n${payload.recommendation.headline}.` : "",
      cta,
      base.slice(0, 4).join(" "),
    ]
      .filter(Boolean)
      .join("\n") + source + aiDisclosure;
    return {
      platform,
      format,
      title: title.slice(0, 100),
      description: description.slice(0, 4900),
      hashtags: base.slice(0, 4),
      extra: { isShort: format === "short", titleVariant: variant.id },
    };
  }

  // TikTok / Instagram: shorter, more informal copy, more hashtags.
  const informalHooks = base.slice(0, 8);
  const title = payload.headlineFact.slice(0, 80);
  const description =
    [payload.headlineFact, cta].filter(Boolean).join(" ") +
    "\n" +
    informalHooks.join(" ") +
    aiDisclosure;
  return {
    platform,
    format,
    title,
    description: description.slice(0, platform === "instagram" ? 2100 : 2150),
    hashtags: informalHooks,
  };
}

/**
 * Stage 7 — Metadata. One PlatformMeta per (platform, format) actually being posted.
 * Plataforma-nativo: each platform gets adapted copy/hashtags, not the same text.
 */
export function createMetadataStage(): Stage {
  return {
    name: "metadata",
    async run(ctx) {
      const payload = ctx.payload;
      if (!payload) throw new Error("metadata: no payload");
      const enabledFormats = new Set(
        ctx.channel.formats.filter((f) => f.enabled).map((f) => f.kind),
      );

      const links = ctx.channel.niche.monetization.links ?? {};
      const metas: PlatformMeta[] = [];
      for (const platform of ctx.channel.platforms) {
        if (!platform.enabled) continue;
        for (const format of platform.posts) {
          if (!enabledFormats.has(format)) continue;
          const meta = buildMeta(ctx.channel, payload, platform.id, format, ctx.date);
          // Contextual affiliate link (+UTM) appended to the description.
          const aff = affiliateForRun(payload, links, { channelId: ctx.channel.id, date: ctx.date, source: platform.id });
          if (aff) meta.description = `${meta.description}\n\n🔗 ${aff.vertical}: ${aff.url}`.slice(0, 4900);
          // Attach the per-format thumbnail + captions so publishers/assisted bundles use them.
          const thumb = ctx.thumbnails?.find((t) => t.format === format);
          const caption = ctx.captions?.find((c) => c.format === format);
          if (thumb || caption) {
            meta.extra = { ...meta.extra, thumbnailPath: thumb?.path, thumbnailVariant: thumb?.variant, captionsPath: caption?.path };
          }
          metas.push(meta);
        }
      }
      ctx.metadata = metas;
      ctx.log("info", "metadata built", { count: metas.length });
    },
  };
}
