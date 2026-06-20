import type { NicheAdapter } from "../_interface.js";
import type { ContentPayload, Metric, RawData, RunContext, Segment } from "../../core/types/index.js";
import { getLlmClient } from "../../engine/llm/client.js";

/**
 * Generative adapter — the "no code" adapter. It produces a ContentPayload for ANY
 * topic directly from the channel's description, using the configured LLM. There is no
 * external data source and nothing to program: a user describes a niche in the config
 * and this turns it into daily content. Use it for knowledge/story channels (mythology,
 * history, curiosities, motivation, true crime, ...).
 *
 * Determinism: the day's angle is chosen from `angles` by date (or asked from the LLM),
 * so each cycle differs but a given date is reproducible. Without an LLM key it falls
 * back to a minimal templated payload so the pipeline still runs.
 */
interface GenerativeConfig {
  angles?: string[];
  require_sources?: boolean;
  trends?: { enabled?: boolean; source?: "google" | "reddit"; geo?: string };
}

interface GenSeed {
  date: string;
  angle: string;
  contentKind: "data" | "knowledge" | "story";
}

function dayIndex(dateIso: string): number {
  const t = Date.parse(`${dateIso}T00:00:00Z`);
  return Number.isFinite(t) ? Math.floor(t / 86400000) : 0;
}

const SYSTEM = `Eres un guionista-investigador de un canal faceless. Devuelves SOLO un objeto JSON con esta forma:
{
 "hook": string,                         // frase de apertura potente y específica
 "keyPoints": [{ "label": string, "value": string }],   // 0-4 datos/ideas clave (value puede ir vacío)
 "beats": [{ "title": string, "detail": string }],      // 3-6 puntos del cuerpo, en orden narrativo
 "context": string,                      // por qué importa / trasfondo (1-2 frases)
 "recommendation": { "headline": string, "items": [{ "label": string, "window": string }] } | null,
 "cta": string,
 "sources": [{ "name": string, "url": string }]         // [] si es contenido narrativo
}
Reglas: específico y veraz; nada de relleno vacío. Si el tipo de contenido es "story", prioriza una narrativa con gancho. Sin markdown, solo el JSON.`;

function buildUser(ctx: RunContext, seed: GenSeed): string {
  const n = ctx.channel.niche;
  return [
    `Tema del canal: ${n.topic}`,
    `Audiencia: ${n.audience}`,
    `Propuesta de valor: ${n.value_proposition}`,
    `Idioma: ${ctx.channel.identity.language}`,
    `Tipo de contenido: ${seed.contentKind}`,
    `Ángulo / asunto de hoy (${seed.date}): ${seed.angle}`,
    "",
    "Genera el contenido del día como el JSON especificado.",
  ].join("\n");
}

function pickAngle(cfg: GenerativeConfig, ctx: RunContext, date: string): string {
  const angles = cfg.angles ?? [];
  if (angles.length > 0) return angles[dayIndex(date) % angles.length]!;
  // No explicit list → let the model choose a fresh angle from the topic itself.
  return `un aspecto interesante y poco conocido de "${ctx.channel.niche.topic}"`;
}

function fallbackPayload(ctx: RunContext, seed: GenSeed): ContentPayload {
  const segments: Segment[] = [
    { title: "Idea principal", detail: `Una mirada a ${seed.angle}.` },
    { title: "Por qué importa", detail: ctx.channel.niche.value_proposition },
  ];
  return {
    channelId: ctx.channel.id,
    date: seed.date,
    headlineFact: `Hoy hablamos de ${seed.angle}`,
    keyMetrics: [],
    segments,
    context: ctx.channel.niche.value_proposition,
    cta: "Sígueme para más.",
    sourceRef: { name: "Contenido generado por IA" },
    safety: {
      factsVerified: false,
      notes: "Adapter generativo sin LLM disponible (fallback mínimo).",
      riskNotes: seed.contentKind === "data" ? ["contenido 'data' sin verificación de datos frescos"] : undefined,
    },
  };
}

class GenerativeAdapter implements NicheAdapter {
  readonly key = "generative";

  async isReady(): Promise<{ ready: boolean; reason?: string }> {
    // No external dependency; cadence is handled by the scheduler.
    return { ready: true };
  }

  async fetch(ctx: RunContext): Promise<RawData> {
    const cfg = (ctx.channel.data.config ?? {}) as GenerativeConfig;
    let angle = pickAngle(cfg, ctx, ctx.date);
    // Optionally anchor today's angle to a trending topic relevant to the niche.
    if (cfg.trends?.enabled) {
      try {
        const { fetchTrends, pickRelevantTrend } = await import("../../trends/index.js");
        const trends = await fetchTrends(cfg.trends.source ?? "google", cfg.trends.geo ?? ctx.channel.identity.region);
        const t = pickRelevantTrend(trends, ctx.channel.niche.topic);
        if (t) {
          angle = `${ctx.channel.niche.topic}: ${t}`;
          ctx.log("info", "trend-anchored angle", { trend: t });
        }
      } catch {
        /* offline → keep base angle */
      }
    }
    const seed: GenSeed = { date: ctx.date, angle, contentKind: ctx.channel.niche.content_kind };
    return seed;
  }

  async analyze(raw: RawData, ctx: RunContext): Promise<ContentPayload> {
    const seed = raw as GenSeed;
    const cfg = (ctx.channel.data.config ?? {}) as GenerativeConfig;
    // Reuse the run-resolved client (local-first auto); resolve if absent (e.g. unit tests).
    const client = ctx.llm !== undefined ? ctx.llm : getLlmClient(ctx.channel.script.provider);
    if (!client) return fallbackPayload(ctx, seed);

    let parsed: any;
    try {
      const out = await client.complete({ system: SYSTEM, user: buildUser(ctx, seed), maxTokens: 1500 });
      parsed = JSON.parse(out.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim());
    } catch {
      return fallbackPayload(ctx, seed);
    }

    const keyMetrics: Metric[] = (parsed.keyPoints ?? [])
      .filter((p: any) => p && p.label)
      .slice(0, 4)
      .map((p: any) => ({ label: String(p.label), value: String(p.value ?? ""), emphasis: "secondary" as const }));
    const segments: Segment[] = (parsed.beats ?? [])
      .filter((b: any) => b && b.title)
      .map((b: any) => ({ title: String(b.title), detail: String(b.detail ?? "") }));
    const sources = (parsed.sources ?? []).filter((s: any) => s && s.name);

    const hasSources = sources.length > 0;
    const verified = seed.contentKind === "story" ? false : hasSources;

    return {
      channelId: ctx.channel.id,
      date: seed.date,
      headlineFact: String(parsed.hook ?? `Hoy: ${seed.angle}`),
      keyMetrics,
      segments: segments.length > 0 ? segments : [{ title: "Resumen", detail: String(parsed.context ?? seed.angle) }],
      recommendation:
        parsed.recommendation && parsed.recommendation.headline
          ? {
              headline: String(parsed.recommendation.headline),
              items: (parsed.recommendation.items ?? []).map((i: any) => ({
                label: String(i.label ?? ""),
                window: String(i.window ?? ""),
              })),
            }
          : undefined,
      context: parsed.context ? String(parsed.context) : undefined,
      cta: String(parsed.cta ?? "Sígueme para más."),
      sourceRef: hasSources ? { name: String(sources[0].name), url: sources[0].url } : { name: "Contenido generado por IA" },
      safety: {
        factsVerified: verified,
        notes: `Adapter generativo (${seed.contentKind}); ángulo: ${seed.angle}.`,
        riskNotes:
          seed.contentKind === "data" && !hasSources
            ? ["nicho 'data' sin fuentes verificables — considera un adapter http o revisión humana"]
            : undefined,
      },
    };
  }
}

export function createGenerativeAdapter(): NicheAdapter {
  return new GenerativeAdapter();
}
