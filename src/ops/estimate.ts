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

// ── Self-host (infra) comparison ────────────────────────────────────────────────
const GPU_HR_USD = Number(process.env.FACTORY_GPU_HR_USD ?? 0.26); // spot RTX 3090
const CPU_VM_MO_USD = Number(process.env.FACTORY_CPU_VM_MO_USD ?? 7); // Hetzner CX32-ish
const OWNED_GPU_USD = Number(process.env.FACTORY_OWNED_GPU_USD ?? 700); // used 3090/4070
const AMORT_MONTHS = 24;
const ELEC_USD_KWH = Number(process.env.FACTORY_ELEC_USD_KWH ?? 0.2);
const GPU_KW = 0.35;

export interface InfraEstimate {
  apiPerMonth: number;
  gpuHoursPerMonth: number;
  gpuOnDemandPerMonth: number; // pay-per-use cloud GPU
  gpu247PerMonth: number; // dedicated cloud GPU 24/7
  ownedGpuPerMonth: number; // amortized purchase + electricity
  cpuVmPerMonth: number;
  breakEvenMonths: number | null; // owned GPU vs API
  assumptions: string[];
}

/** Estimate GPU-hours/month and compare cloud APIs vs self-hosting. */
export function estimateInfra(channel: ChannelDefinition): InfraEstimate {
  const cycles = cyclesPerMonth(channel);
  const v = channel.video;
  // GPU minutes per shot by mode (rough): images ≈ 0.5, generative video ≈ 3, data_card ≈ 0.
  const perShotMin = v?.mode === "generative" ? 3 : v?.mode === "images" ? 0.5 : 0;
  let shotsPerCycle = 0;
  for (const f of channel.formats.filter((x) => x.enabled)) {
    const words = channel.script.max_words?.[f.kind] ?? (f.kind === "short" ? 110 : 420);
    shotsPerCycle += shotsFor(channel, words);
  }
  const genMin = cycles * shotsPerCycle * perShotMin;
  const overheadMin = cycles * 1; // model load / LLM / misc per cycle
  const gpuHoursPerMonth = Math.round(((genMin + overheadMin) / 60) * 10) / 10;

  const round = (n: number) => Math.round(n * 100) / 100;
  const api = estimateChannel(channel).perMonthUsd;
  const gpuOnDemand = round(gpuHoursPerMonth * GPU_HR_USD);
  const gpu247 = round(730 * GPU_HR_USD);
  const elec = round(gpuHoursPerMonth * GPU_KW * ELEC_USD_KWH);
  const ownedGpu = round(OWNED_GPU_USD / AMORT_MONTHS + elec);
  const breakEvenMonths = api > 0 ? Math.ceil(OWNED_GPU_USD / api) : null;

  return {
    apiPerMonth: api,
    gpuHoursPerMonth,
    gpuOnDemandPerMonth: gpuOnDemand,
    gpu247PerMonth: gpu247,
    ownedGpuPerMonth: ownedGpu,
    cpuVmPerMonth: CPU_VM_MO_USD,
    breakEvenMonths,
    assumptions: [
      `${cycles} ciclos/mes · ${shotsPerCycle} plano(s)/ciclo · ${perShotMin} min-GPU/plano`,
      `GPU spot $${GPU_HR_USD}/h · VM CPU $${CPU_VM_MO_USD}/mes · GPU propia $${OWNED_GPU_USD} a ${AMORT_MONTHS} meses + luz`,
    ],
  };
}

export function formatInfra(channel: ChannelDefinition, e: InfraEstimate): string {
  const cpu = e.cpuVmPerMonth;
  const L = [`\nInfra: API cloud vs self-host — ${channel.id}`];
  L.push(`  GPU estimada: ${e.gpuHoursPerMonth} h/mes`);
  L.push("  ──────────────────────────────────────────────");
  L.push(`  A) APIs de terceros (vídeo/voz/imagen):   $${e.apiPerMonth}/mes`);
  L.push(`  B) GPU cloud a demanda + VM CPU:          $${(e.gpuOnDemandPerMonth + cpu).toFixed(2)}/mes  (gpu $${e.gpuOnDemandPerMonth} + vm $${cpu})`);
  L.push(`  C) GPU cloud 24/7 + VM CPU:               $${(e.gpu247PerMonth + cpu).toFixed(2)}/mes   ← evítalo`);
  L.push(`  D) GPU propia (amortizada) + VM CPU:      $${(e.ownedGpuPerMonth + cpu).toFixed(2)}/mes`);
  L.push("  ──────────────────────────────────────────────");
  if (e.apiPerMonth > 0 && e.breakEvenMonths) {
    L.push(`  Comprar GPU se amortiza vs APIs en ~${e.breakEvenMonths} mes(es).`);
  }
  if (e.gpuOnDemandPerMonth + cpu < e.apiPerMonth) {
    L.push(`  → Más barato: GPU a demanda (opción B).`);
  } else if (e.apiPerMonth === 0) {
    L.push(`  → Este canal no usa media de pago (estimación API = $0).`);
  }
  L.push("  Supuestos: " + e.assumptions.join("; "));
  L.push("  (Ajusta tarifas con FACTORY_GPU_HR_USD / FACTORY_CPU_VM_MO_USD / FACTORY_OWNED_GPU_USD)");
  return L.join("\n");
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
