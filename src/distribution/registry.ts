import type { Publisher } from "./_interface.js";
import { createYouTubePublisher } from "./youtube/index.js";
import { createTikTokPublisher } from "./tiktok/index.js";
import { createInstagramPublisher } from "./instagram/index.js";
import { XPublisher, BlueskyPublisher, LinkedInPublisher } from "./social/index.js";

const registry: Record<string, () => Publisher> = {
  youtube: createYouTubePublisher,
  tiktok: createTikTokPublisher,
  instagram: createInstagramPublisher,
  x: () => new XPublisher(),
  bluesky: () => new BlueskyPublisher(),
  linkedin: () => new LinkedInPublisher(),
};

/** Platforms that post text+link (cross-post), processed after the video platforms. */
export const TEXT_PLATFORMS = new Set(["x", "bluesky", "linkedin"]);

export function getPublisher(platform: string): Publisher {
  const factory = registry[platform];
  if (!factory) throw new Error(`No publisher for platform "${platform}"`);
  return factory();
}
