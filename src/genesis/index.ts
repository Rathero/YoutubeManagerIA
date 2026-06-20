import { getLlmClient, type LlmClient } from "../engine/llm/client.js";
import { ChannelDefinitionSchema, type ChannelDefinition } from "../core/types/index.js";
import { hasAdapter } from "../adapters/registry.js";

export interface GenesisInput {
  topic: string;
  language?: string;
  region?: string;
  constraints?: { platforms?: string[]; cadence?: string };
  /** Production preferences baked into the draft config. */
  prefs?: {
    textProvider?: "anthropic" | "openai" | "gemini" | "auto";
    voiceProvider?: "elevenlabs" | "openai" | "google" | "stub";
    videoMode?: "data_card" | "generative";
    videoProvider?: "veo" | "sora" | "runway" | "stub";
    style?: string;
  };
}

export interface ViabilityScore {
  demand: number; // 0..1
  moat: number; // data-source defensibility — the most important filter
  monetization: number;
  effort: number; // higher = more effort (penalized)
  total: number; // 0..1
  recommendation: "go" | "iterate" | "no-go";
}

export interface GenesisResult {
  definition: ChannelDefinition;
  report: string;
  viability: ViabilityScore;
  adapterSpec?: string; // present when the data source needs a new adapter
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 32);
}

interface Analysis {
  subNiches: string[];
  audience: string;
  valueProp: string;
  dataSource: { name: string; fresh: boolean; accessible: boolean; notes: string };
  monetization: { primary: "affiliate" | "adsense" | "product" | "mixed"; verticals: string[] };
  brandName: string;
  voicePersona: string;
  scores: { demand: number; moat: number; monetization: number; effort: number };
}

/** Heuristic (no-LLM) analysis so Genesis runs offline. Conservative defaults. */
function heuristicAnalysis(input: GenesisInput): Analysis {
  return {
    subNiches: [input.topic],
    audience: `personas interesadas en ${input.topic}`,
    valueProp: `información útil y fresca sobre ${input.topic} cada día`,
    dataSource: {
      name: "(por definir)",
      fresh: false,
      accessible: false,
      notes: "Genesis no pudo verificar una fuente de datos fresca sin LLM/investigación. Revisar a mano.",
    },
    monetization: { primary: "affiliate", verticals: [] },
    brandName: input.topic,
    voicePersona: "Cercano, claro, directo. Tutea. Da el dato ya y una recomendación accionable.",
    scores: { demand: 0.5, moat: 0.3, monetization: 0.5, effort: 0.5 },
  };
}

const ANALYSIS_SYSTEM = `Eres un estratega de canales faceless. Analizas un nicho y devuelves SOLO un objeto JSON con esta forma exacta:
{
 "subNiches": string[],
 "audience": string,
 "valueProp": string,
 "dataSource": { "name": string, "fresh": boolean, "accessible": boolean, "notes": string },
 "monetization": { "primary": "affiliate"|"adsense"|"product"|"mixed", "verticals": string[] },
 "brandName": string,
 "voicePersona": string,
 "scores": { "demand": number, "moat": number, "monetization": number, "effort": number }
}
Los scores van de 0 a 1. "moat" mide si existe una fuente de datos fiable, fresca y procesable (el filtro más importante: sin dato repetible y propio, el nicho es riesgo de slop). Sé honesto y conservador. Sin markdown, sin explicaciones fuera del JSON.`;

async function llmAnalysis(client: LlmClient, input: GenesisInput): Promise<Analysis> {
  const user = `Nicho: ${input.topic}\nIdioma: ${input.language ?? "es-ES"}\nRegión: ${input.region ?? "ES"}\nDevuelve el JSON de análisis.`;
  const raw = await client.complete({ system: ANALYSIS_SYSTEM, user, maxTokens: 1200 });
  const json = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  return JSON.parse(json) as Analysis;
}

function score(a: Analysis): ViabilityScore {
  const { demand, moat, monetization, effort } = a.scores;
  // Moat is weighted heaviest — it's the anti-slop filter.
  const total =
    demand * 0.25 + moat * 0.4 + monetization * 0.25 + (1 - effort) * 0.1;
  const recommendation = total >= 0.6 && moat >= 0.5 ? "go" : total >= 0.45 ? "iterate" : "no-go";
  return { demand, moat, monetization, effort, total: Math.round(total * 100) / 100, recommendation };
}

function buildDefinition(input: GenesisInput, a: Analysis): ChannelDefinition {
  const language = input.language ?? "es-ES";
  const region = input.region ?? "ES";
  const id = `${slugify(a.brandName || input.topic)}-${region.toLowerCase()}`;
  const adapterKey = hasAdapter(slugify(input.topic)) ? slugify(input.topic) : "generic";
  const prefs = input.prefs ?? {};
  const generative = prefs.videoMode === "generative";

  const draft = {
    id,
    status: "draft" as const,
    version: 1,
    identity: {
      name: a.brandName || input.topic,
      language,
      region,
      brand: {
        palette: { bg: "#0b1220", fg: "#ffffff", accent: "#3b82f6" },
        fonts: { heading: "Inter", body: "Inter" },
        visual_template: "data-card-v1",
      },
      voice_persona: {
        description: a.voicePersona,
        do: ["dar el dato ya", "una recomendación accionable"],
        dont: ["clickbait", "alarmismo"],
      },
    },
    niche: {
      topic: input.topic,
      audience: a.audience,
      value_proposition: a.valueProp,
      monetization: {
        primary: a.monetization.primary,
        affiliate_verticals: a.monetization.verticals,
      },
    },
    data: {
      adapter: adapterKey,
      freshness: { type: "daily", confirm_field: "ready" },
      config: {},
    },
    formats: [
      { kind: "short" as const, enabled: true, target_seconds: 40, structure: ["hook", "dato_clave", "cuerpo", "cta"] },
      { kind: "long" as const, enabled: false, target_seconds: 180, structure: ["intro", "datos", "contexto", "consejo", "cta"] },
    ],
    script: {
      prompt_template: `src/templates/${adapterKey}/script.md`,
      max_words: { short: 110, long: 420 },
      language_rules: `${language}, frases cortas`,
      provider: { name: prefs.textProvider ?? "auto" },
    },
    voice: {
      provider: prefs.voiceProvider ?? "stub",
      speed: 1.05,
      ...(prefs.voiceProvider === "elevenlabs" ? { model_id: "eleven_v3", stability: 0.4, similarity: 0.85 } : {}),
    },
    render: {
      engine: generative ? ("generative" as const) : ("ffmpeg" as const),
      template: "data-card-v1",
      aspect_ratios: ["9:16", "16:9"],
      music: { enabled: false },
    },
    ...(generative
      ? {
          video: {
            mode: "generative" as const,
            provider: prefs.videoProvider ?? ("veo" as const),
            style: prefs.style ?? "realistic",
            clip_seconds: 8,
            resolution: "1080p" as const,
            use_native_audio: false,
            max_clips: 5,
            llm_storyboard: true,
          },
        }
      : {}),
    platforms: [
      { id: "youtube" as const, enabled: true, account_ref: `secrets://youtube/${id}`, posts: ["short" as const], publish_times: { short: "21:30" }, mode: "assisted" as const },
    ],
    schedule: { timezone: "Europe/Madrid", trigger: { type: "pure_cron" as const, at: "20:30" } },
    kpis: { targets: { short_retention_pct: 50 }, review_after_days: 28 },
  };

  return ChannelDefinitionSchema.parse(draft);
}

function buildReport(input: GenesisInput, a: Analysis, v: ViabilityScore, adapterExists: boolean): string {
  return `# Genesis — Informe de estrategia: ${a.brandName || input.topic}

## Nicho
- Tema: ${input.topic}
- Sub-nichos candidatos: ${a.subNiches.join(", ")}
- Audiencia: ${a.audience}
- Propuesta de valor: ${a.valueProp}

## Fuente de datos (foso) — el filtro más importante
- Fuente: ${a.dataSource.name}
- ¿Fresca?: ${a.dataSource.fresh ? "sí" : "no"} · ¿Accesible?: ${a.dataSource.accessible ? "sí" : "no"}
- Notas: ${a.dataSource.notes}
- Adapter: ${adapterExists ? "ya existe" : "**hay que construirlo** (ver spec)"}

## Monetización
- Primaria: ${a.monetization.primary}
- Verticales de afiliación: ${a.monetization.verticals.join(", ") || "(ninguna)"}

## Viability score
| Dimensión | Score |
|---|---|
| Demanda | ${a.scores.demand} |
| Foso (datos) | ${a.scores.moat} |
| Monetización | ${a.scores.monetization} |
| Esfuerzo | ${a.scores.effort} |
| **Total** | **${v.total}** |

**Recomendación: ${v.recommendation.toUpperCase()}**

## Siguiente paso (gate humano)
Genesis genera un \`ChannelDefinition\` en estado \`draft\`. Revisa la config, ajusta marca/formatos,
y solo entonces pásalo a \`active\`. Genesis nunca activa por su cuenta.
`;
}

function adapterSpec(input: GenesisInput, a: Analysis): string {
  return `# Spec de adapter: ${slugify(input.topic)}

Implementa \`NicheAdapter\` en \`src/adapters/${slugify(input.topic)}/\`:

- **isReady(ctx)**: ¿hay dato fresco para el ciclo? Fuente sugerida: ${a.dataSource.name}.
- **fetch(ctx)**: trae los datos crudos de la fuente.
- **analyze(raw, ctx)**: lógica DETERMINISTA → ContentPayload (headlineFact, keyMetrics, segments, recommendation, sourceRef, safety.factsVerified=true).

Notas de la fuente: ${a.dataSource.notes}
`;
}

/**
 * Phase A — Genesis. Turns a topic into a draft ChannelDefinition + strategy report +
 * viability score. Uses an LLM when available; otherwise a conservative heuristic.
 * Ends at a human gate (never activates a channel itself).
 */
export async function runGenesis(input: GenesisInput): Promise<GenesisResult> {
  const client = getLlmClient();
  let analysis: Analysis;
  try {
    analysis = client ? await llmAnalysis(client, input) : heuristicAnalysis(input);
  } catch {
    analysis = heuristicAnalysis(input);
  }

  const definition = buildDefinition(input, analysis);
  const viability = score(analysis);
  const adapterExists = hasAdapter(definition.data.adapter) && definition.data.adapter !== "generic";
  const report = buildReport(input, analysis, viability, adapterExists);
  return {
    definition,
    report,
    viability,
    adapterSpec: adapterExists ? undefined : adapterSpec(input, analysis),
  };
}
