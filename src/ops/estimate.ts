import type { ChannelDefinition } from "../core/types/index.js";

/**
 * Rough cost model (USD), easily editable. Local providers are $0. These are ballpark
 * public rates as of 2026 — adjust to your contracts. Used by `factory estimate`.
 */
const TEXT_PER_PIECE: Record<string, number> = { anthropic: 0.012, openai: 0.01, gemini: 0.004, local: 0, ollama: 0, auto: 0.01 };
const VOICE_PER_1K_CHARS: Record<string, number> = { elevenlabs: 0.15, openai: 0.015, google: 0.016, local: 0, kokoro: 0, piper: 0, azure: 0.016, stub: 0 };
const VIDEO_PER_SEC: Record<string, number> = { veo: 0.15, sora: 0.75, runway: 0.1, comfyui: 0, stub: 0 };
const IMAGE_PER_IMG: Record<string, number> = { openai: 0.04, comfyui: 0, stub: 0 };

export interface CostBreakdown {
  text: number;
  voice: number;
  media: number;
  thumbnail: number;
}
export interface ChannelEstimate {
  cyclesPerMonth: number;
  perCycleUsd: number;
  perMonthUsd: number;
  breakdown: CostBreakdown; // per month
  fullyLocal: boolean;
  assumptions: string[];
}

function cyclesPerMonth(channel: ChannelDefinition): number {
  // Weekly-only channels run ~4x/month; otherwise assume daily.
  const kinds = channel.formats.filter((f) => f.enabled).map((f) => f.kind);
  if (kinds.length > 0 && kinds.every((k) => k === "weekly")) return 4;
  return 30;
}

function shotsFor(channel: ChannelDefinition, words: number): number {
  const v = channel.video;
  if (!v) return 0;
  return Math.min(v.max_clips, Math.max(2, Math.ceil(words / 22)));
}

export function estimateChannel(channel: ChannelDefinition): ChannelEstimate {
  const cycles = cyclesPerMonth(channel);
  const textRate = TEXT_PER_PIECE[channel.script.provider.name] ?? 0.01;
  const voiceRate = VOICE_PER_1K_CHARS[channel.voice.provider] ?? 0;
  const assumptions: string[] = [];

  let text = 0, voice = 0, media = 0, thumbnail = 0;
  for (const f of channel.formats.filter((x) => x.enabled)) {
    const words = channel.script.max_words?.[f.kind] ?? (f.kind === "short" ? 110 : 420);
    text += textRate;
    voice += (words * 6 / 1000) * voiceRate;

    const v = channel.video;
    if (v && (v.mode === "generative" || v.mode === "images")) {
      const shots = shotsFor(channel, words);
      if (v.mode === "generative") media += shots * v.clip_seconds * (VIDEO_PER_SEC[v.provider] ?? 0);
      else media += shots * (IMAGE_PER_IMG[channel.image?.provider ?? "stub"] ?? 0);
    }
    if (channel.render.thumbnails.enabled && channel.image) {
      thumbnail += IMAGE_PER_IMG[channel.image.provider] ?? 0;
    }
  }

  const perCycle = text + voice + media + thumbnail;
  const round = (n: number) => Math.round(n * 100) / 100;
  const fullyLocal = perCycle === 0;
  assumptions.push(`${cycles} ciclos/mes (${cycles === 30 ? "diario" : "semanal"})`);
  assumptions.push("~6 caracteres por palabra para TTS");
  if (channel.video) assumptions.push(`vídeo: modo ${channel.video.mode}, hasta ${channel.video.max_clips} planos`);

  return {
    cyclesPerMonth: cycles,
    perCycleUsd: round(perCycle),
    perMonthUsd: round(perCycle * cycles),
    breakdown: { text: round(text * cycles), voice: round(voice * cycles), media: round(media * cycles), thumbnail: round(thumbnail * cycles) },
    fullyLocal,
    assumptions,
  };
}

export function formatEstimate(channel: ChannelDefinition, e: ChannelEstimate): string {
  const lines = [`\nEstimación de coste — ${channel.id}`];
  if (e.fullyLocal) {
    lines.push("  ✅ Stack 100% local → coste de IA: $0/mes.");
  } else {
    lines.push(`  Por ciclo:  $${e.perCycleUsd}`);
    lines.push(`  Por mes:    $${e.perMonthUsd}  (${e.cyclesPerMonth} ciclos)`);
    lines.push(`    texto $${e.breakdown.text} · voz $${e.breakdown.voice} · vídeo/imagen $${e.breakdown.media} · thumbnail $${e.breakdown.thumbnail}`);
  }
  lines.push("  Supuestos: " + e.assumptions.join("; "));
  lines.push("  (Tarifas aproximadas 2026; ajústalas en src/ops/estimate.ts)");
  return lines.join("\n");
}
