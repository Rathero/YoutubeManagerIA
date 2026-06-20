import type { Stage } from "../../core/pipeline/stage.js";
import type {
  ChannelDefinition,
  ContentPayload,
  FormatKind,
  PlatformMeta,
} from "../../core/types/index.js";

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
): PlatformMeta {
  const base = baseHashtags(channel);
  const cta = payload.cta ?? "";
  const source = payload.sourceRef.url ? `\n\nFuente: ${payload.sourceRef.name} (${payload.sourceRef.url})` : "";
  const aiDisclosure = "\n\nContenido con voz/edición generada por IA.";

  if (platform === "youtube") {
    // SEO-leaning title; description carries detail + source + a few tags.
    const title =
      format === "short"
        ? `${payload.headlineFact} #shorts`
        : `${payload.headlineFact} | ${channel.identity.name}`;
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
      extra: { isShort: format === "short" },
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

      const metas: PlatformMeta[] = [];
      for (const platform of ctx.channel.platforms) {
        if (!platform.enabled) continue;
        for (const format of platform.posts) {
          if (!enabledFormats.has(format)) continue;
          const meta = buildMeta(ctx.channel, payload, platform.id, format);
          // Attach the per-format thumbnail + captions so publishers/assisted bundles use them.
          const thumb = ctx.thumbnails?.find((t) => t.format === format);
          const caption = ctx.captions?.find((c) => c.format === format);
          if (thumb || caption) {
            meta.extra = { ...meta.extra, thumbnailPath: thumb?.path, captionsPath: caption?.path };
          }
          metas.push(meta);
        }
      }
      ctx.metadata = metas;
      ctx.log("info", "metadata built", { count: metas.length });
    },
  };
}
