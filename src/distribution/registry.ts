import type { Publisher } from "./_interface.js";
import { createYouTubePublisher } from "./youtube/index.js";
import { createTikTokPublisher } from "./tiktok/index.js";
import { createInstagramPublisher } from "./instagram/index.js";

const registry: Record<string, () => Publisher> = {
  youtube: createYouTubePublisher,
  tiktok: createTikTokPublisher,
  instagram: createInstagramPublisher,
};

export function getPublisher(platform: string): Publisher {
  const factory = registry[platform];
  if (!factory) throw new Error(`No publisher for platform "${platform}"`);
  return factory();
}
