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

  // Generative video config sanity (data_card/generative/images all routed via video).
  const generative =
    channel.render.engine === "generative" ||
    channel.video?.mode === "generative" ||
    channel.video?.mode === "images";
  if (generative) {
    if (!channel.video) {
      errors.push("render.engine=generative requires a `video` section");
    } else if (channel.video.mode === "images") {
      // Cheap image path. Check the image provider.
      const img = channel.image;
      if (!img) warnings.push("video.mode=images but no `image` section — will use stub stills");
      else if (img.provider === "comfyui") {
        if (!img.workflow) warnings.push("image.provider=comfyui but no workflow set — will use stub stills");
        else if (!(await exists(img.workflow))) warnings.push(`image workflow "${img.workflow}" not found`);
        else warnings.push(`image.provider=comfyui → ComfyUI at ${process.env.FACTORY_COMFYUI_URL ?? "http://localhost:8188"} (stub if unreachable)`);
      } else if (img.provider === "openai" && !process.env.OPENAI_API_KEY) {
        warnings.push("image.provider=openai but OPENAI_API_KEY not set — will use stub stills");
      }
    } else if (channel.video.provider === "comfyui") {
      if (!channel.video.workflow) warnings.push("video.provider=comfyui but no workflow set — will use stub clips");
      else warnings.push(`video.provider=comfyui → ComfyUI at ${process.env.FACTORY_COMFYUI_URL ?? "http://localhost:8188"} (stub if unreachable)`);
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

  // Voice provider hints (cloud keys / local servers).
  if (channel.voice.provider === "elevenlabs" && !process.env.ELEVENLABS_API_KEY) {
    warnings.push("voice.provider=elevenlabs but ELEVENLABS_API_KEY not set — will use stub voice");
  }
  if ((channel.voice.provider === "local" || channel.voice.provider === "kokoro")) {
    warnings.push(`voice.provider=${channel.voice.provider} → local TTS at ${process.env.FACTORY_LOCAL_TTS_URL ?? "http://localhost:8880/v1"} (stub if unreachable)`);
  }
  if (channel.voice.provider === "piper" && !channel.voice.model_path) {
    warnings.push("voice.provider=piper but no model_path set — will use stub voice");
  }

  // Local text provider hint.
  if (channel.script.provider.name === "local" || channel.script.provider.name === "ollama") {
    warnings.push(`text provider=local → ${channel.script.provider.base ?? process.env.FACTORY_LOCAL_LLM_URL ?? "http://localhost:11434/v1"} (deterministic fallback if unreachable)`);
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
