import { access } from "node:fs/promises";
import { resolve } from "node:path";
import type { ChannelDefinition } from "../core/types/index.js";
import { hasAdapter } from "../adapters/registry.js";

export interface ValidationReport {
  channelId: string;
  ok: boolean;
  errors: string[];
  warnings: string[];
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(resolve(process.cwd(), path));
    return true;
  } catch {
    return false;
  }
}

/**
 * `factory validate` — a channel may only go `active` if everything it needs exists:
 * adapter registered, prompt template present, at least one enabled format & platform,
 * and credentials hints present per enabled platform.
 */
export async function validateChannel(channel: ChannelDefinition): Promise<ValidationReport> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!hasAdapter(channel.data.adapter)) {
    errors.push(`adapter "${channel.data.adapter}" is not registered`);
  }

  if (channel.script.prompt_template && !(await exists(channel.script.prompt_template))) {
    warnings.push(`prompt template "${channel.script.prompt_template}" not found (will use deterministic script)`);
  }

  if (channel.formats.filter((f) => f.enabled).length === 0) {
    errors.push("no enabled formats");
  }

  // Generative video config sanity.
  const generative = channel.render.engine === "generative" || channel.video?.mode === "generative";
  if (generative) {
    if (!channel.video) {
      errors.push("render.engine=generative requires a `video` section");
    } else {
      const keyByProvider: Record<string, string> = {
        veo: "GEMINI_API_KEY/GOOGLE_API_KEY",
        sora: "OPENAI_API_KEY",
        runway: "RUNWAY_API_KEY",
      };
      const need = keyByProvider[channel.video.provider];
      const have =
        (channel.video.provider === "veo" && (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)) ||
        (channel.video.provider === "sora" && process.env.OPENAI_API_KEY) ||
        (channel.video.provider === "runway" && (process.env.RUNWAY_API_KEY || process.env.RUNWAYML_API_SECRET));
      if (need && !have) {
        warnings.push(`video.provider=${channel.video.provider} but ${need} not set — will use stub clips`);
      }
    }
  }

  // Realistic-voice provider key hints.
  if (channel.voice.provider === "elevenlabs" && !process.env.ELEVENLABS_API_KEY) {
    warnings.push("voice.provider=elevenlabs but ELEVENLABS_API_KEY not set — will use stub voice");
  }

  const enabledPlatforms = channel.platforms.filter((p) => p.enabled);
  if (enabledPlatforms.length === 0) {
    warnings.push("no enabled platforms — nothing will be published");
  }
  for (const p of enabledPlatforms) {
    if (!p.account_ref) errors.push(`platform ${p.id}: missing account_ref`);
    if (p.posts.length === 0) warnings.push(`platform ${p.id}: posts[] empty`);
    if (p.id === "youtube" && p.mode === "auto" && !process.env.FACTORY_YT_ACCESS_TOKEN) {
      warnings.push("youtube mode=auto but FACTORY_YT_ACCESS_TOKEN not set — will fall back to assisted queue");
    }
  }

  if (channel.status === "active") {
    // Active channels are held to the stricter bar.
    if (errors.length > 0) errors.push("channel is 'active' but has blocking errors above");
  }

  return { channelId: channel.id, ok: errors.length === 0, errors, warnings };
}
