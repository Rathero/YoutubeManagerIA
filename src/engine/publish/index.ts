import type { Stage } from "../../core/pipeline/stage.js";
import type { PublishResult, RenderedAsset } from "../../core/types/index.js";
import { getPublisher, TEXT_PLATFORMS } from "../../distribution/registry.js";
import { emitOwnDistribution } from "../../distribution/own/newsletter.js";
import type { Store } from "../../storage/store.js";

/** Pick the best rendered asset for a platform+format (right aspect ratio). */
function pickAsset(rendered: RenderedAsset[], format: string, platform: string): RenderedAsset | undefined {
  const wantAspect = format === "short" ? "9:16" : format === "square" ? "1:1" : "16:9";
  return (
    rendered.find((a) => a.format === format && a.aspectRatio === wantAspect) ??
    rendered.find((a) => a.format === format)
  );
}

/**
 * Stage 9 — Publish. Multi-platform, idempotent. Each (channel,date,format,platform)
 * is published at most once (checked against the store). dry-run short-circuits inside
 * each publisher.
 */
export function createPublishStage(store: Store): Stage {
  return {
    name: "publish",
    async run(ctx) {
      if (!ctx.metadata || !ctx.rendered) throw new Error("publish: missing metadata/rendered");
      const results: PublishResult[] = [];

      // Two passes: video platforms first, then text cross-posts (which get the link).
      const enabled = ctx.channel.platforms.filter((p) => p.enabled);
      const videoPlatforms = enabled.filter((p) => !TEXT_PLATFORMS.has(p.id));
      const textPlatforms = enabled.filter((p) => TEXT_PLATFORMS.has(p.id));

      for (const platform of [...videoPlatforms, ...textPlatforms]) {
        const publisher = getPublisher(platform.id);
        const isText = TEXT_PLATFORMS.has(platform.id);
        // The link to share = the best published video URL so far.
        const link = results.find((r) => r.url)?.url;
        for (const meta of ctx.metadata.filter((m) => m.platform === platform.id)) {
          if (isText && link) meta.extra = { ...meta.extra, link };
          const already = await store.isPublished(ctx.channel.id, ctx.date, meta.format, platform.id);
          if (already) {
            results.push({ platform: platform.id, format: meta.format, status: "skipped", message: "already published (idempotent)" });
            continue;
          }
          let asset = pickAsset(ctx.rendered, meta.format, platform.id);
          if (!asset) {
            if (isText) {
              // Text cross-posts don't need a video asset.
              asset = { format: meta.format, aspectRatio: "", path: "", durationSec: 0, mimeType: "" };
            } else {
              results.push({ platform: platform.id, format: meta.format, status: "failed", message: "no rendered asset" });
              continue;
            }
          }
          const res = await publisher.publish({
            channelId: ctx.channel.id,
            date: ctx.date,
            asset,
            meta,
            account: { ref: platform.account_ref, mode: platform.mode },
            dryRun: ctx.dryRun,
          });
          results.push(res);
        }
      }

      // Own distribution (newsletter / Telegram) — independent of the algorithm.
      if (ctx.payload && ctx.channel.distribution_own) {
        const own = await emitOwnDistribution(ctx.channel, ctx.date, ctx.payload, ctx.dryRun);
        results.push(...own);
      }

      ctx.publications = results;
      ctx.log("info", "publish done", {
        published: results.filter((r) => r.status === "published").length,
        queued: results.filter((r) => r.status === "queued_assisted").length,
        skipped: results.filter((r) => r.status === "skipped").length,
        failed: results.filter((r) => r.status === "failed").length,
      });
    },
  };
}
