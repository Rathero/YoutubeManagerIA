import { getLlmClient } from "../engine/llm/client.js";

export type ContentKind = "data" | "knowledge" | "story";

export interface StrategyRecommendation {
  brandName: string;
  audience: string;
  valueProp: string;
  contentKind: ContentKind;
  /** "generative" (no data source) or "http" (declarative feed) or a known code adapter. */
  adapter: "generative" | "http" | "luz";
  videoMode: "data_card" | "generative";
  videoProvider: "veo" | "sora" | "runway";
  style: string;
  styleRationale: string;
  voiceProvider: "elevenlabs" | "openai" | "google";
  textProvider: "anthropic" | "openai" | "gemini" | "auto";
  formats: Array<"short" | "long">;
  monetization: { primary: "affiliate" | "adsense" | "product" | "mixed"; verticals: string[] };
  /** For data niches: a suggested public data source, when one is known. */
  dataSourceHint?: string;
  rationale: string;
}

function has(topic: string, words: string[]): boolean {
  const t = topic.toLowerCase();
  return words.some((w) => t.includes(w));
}

function detectKind(topic: string): ContentKind {
  if (has(topic, ["precio", "price", "coste", "tarifa", "clima", "tiempo", "temperatura", "weather", "estadístic", "stats", "ranking", "bolsa", "cripto", "crypto", "índice", "indice", "datos", "cotizaci"]))
    return "data";
  if (has(topic, ["mito", "leyenda", "histor", "story", "cuento", "relato", "terror", "crimen", "true crime", "misterio", "saga", "épica", "epica"]))
    return "story";
  return "knowledge";
}

function detectStyle(topic: string, kind: ContentKind): { style: string; why: string } {
  if (has(topic, ["anime", "otaku", "shonen", "shōnen"])) return { style: "anime", why: "la temática encaja con estética anime" };
  if (has(topic, ["manga", "cómic japonés", "comic japones"])) return { style: "manga", why: "estética de viñeta manga en blanco y negro" };
  if (has(topic, ["cómic", "comic", "superhéroe", "superheroe", "marvel", "dc"])) return { style: "comic", why: "estética de cómic occidental" };
  if (has(topic, ["niños", "ninos", "infantil", "kids", "cuento", "fábula", "fabula"])) return { style: "cartoon3d", why: "público infantil → 3D amable" };
  if (has(topic, ["retro", "videojuego", "8 bits", "16 bits", "pixel", "arcade"])) return { style: "pixelart", why: "estética retro/gaming" };
  if (has(topic, ["terror", "crimen", "misterio", "true crime", "oscuro"])) return { style: "cinematic", why: "tono dramático/oscuro → cine" };
  if (kind === "story") return { style: "cinematic", why: "narrativa con gancho → look cinematográfico" };
  if (has(topic, ["naturaleza", "viaje", "travel", "comida", "food", "receta", "fitness", "deporte"])) return { style: "realistic", why: "contenido del mundo real → fotorrealista" };
  if (kind === "data") return { style: "data_card", why: "los datos lucen mejor como gráficos de marca" };
  return { style: "realistic", why: "explicativo cercano → fotorrealista" };
}

/** Deterministic heuristic recommendation — works offline, no LLM required. */
export function heuristicRecommendation(topic: string): StrategyRecommendation {
  const kind = detectKind(topic);
  const { style, why } = detectStyle(topic, kind);
  const videoMode: "data_card" | "generative" = style === "data_card" || kind === "data" ? "data_card" : "generative";
  const videoProvider: "veo" | "sora" | "runway" = style === "cinematic" ? "veo" : "veo";

  return {
    brandName: topic.length <= 40 ? topic : topic.slice(0, 40),
    audience: `personas interesadas en ${topic}`,
    valueProp: `contenido claro y atractivo sobre ${topic}`,
    contentKind: kind,
    adapter: kind === "data" ? "http" : "generative",
    videoMode,
    videoProvider,
    style,
    styleRationale: why,
    voiceProvider: "elevenlabs",
    textProvider: "auto",
    formats: kind === "data" ? ["short"] : ["short", "long"],
    monetization: { primary: "affiliate", verticals: [] },
    rationale: `Detectado tipo "${kind}". Adapter "${kind === "data" ? "http" : "generative"}" (sin código). Estilo "${style}" porque ${why}.`,
  };
}

const SYSTEM = `Eres un consultor de canales faceless. Dada una temática, recomiendas la mejor configuración y devuelves SOLO este JSON:
{
 "brandName": string,
 "audience": string,
 "valueProp": string,
 "contentKind": "data"|"knowledge"|"story",
 "style": "realistic"|"cinematic"|"documentary"|"anime"|"manga"|"comic"|"cartoon3d"|"claymation"|"pixelart"|"watercolor"|"data_card",
 "styleRationale": string,
 "videoProvider": "veo"|"sora"|"runway",
 "voiceProvider": "elevenlabs"|"openai"|"google",
 "formats": ["short"] | ["short","long"],
 "monetization": { "primary": "affiliate"|"adsense"|"product"|"mixed", "verticals": string[] },
 "dataSourceHint": string,
 "rationale": string
}
contentKind "data" = se apoya en cifras frescas (precios, clima, stats); "story" = narrativa; "knowledge" = explicativo/curiosidades.
Si es "data" y conoces una fuente pública fiable, ponla en dataSourceHint. Sé conciso. Sin markdown.`;

/** LLM-enhanced recommendation, layered over the heuristic; falls back cleanly. */
export async function recommendStrategy(
  topic: string,
  opts?: { language?: string; goal?: string; textProvider?: StrategyRecommendation["textProvider"] },
): Promise<StrategyRecommendation> {
  const base = heuristicRecommendation(topic);
  base.textProvider = opts?.textProvider ?? base.textProvider;
  const client = getLlmClient(opts?.textProvider ? { name: opts.textProvider } : undefined);
  if (!client) return base;

  try {
    const user = `Temática: ${topic}\nObjetivo: ${opts?.goal ?? "(no especificado)"}\nIdioma: ${opts?.language ?? "es-ES"}\nRecomienda la configuración.`;
    const out = await client.complete({ system: SYSTEM, user, maxTokens: 900 });
    const p = JSON.parse(out.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim());
    const kind: ContentKind = ["data", "knowledge", "story"].includes(p.contentKind) ? p.contentKind : base.contentKind;
    const style = String(p.style ?? base.style);
    const videoMode: "data_card" | "generative" = style === "data_card" || kind === "data" ? "data_card" : "generative";
    return {
      brandName: String(p.brandName ?? base.brandName),
      audience: String(p.audience ?? base.audience),
      valueProp: String(p.valueProp ?? base.valueProp),
      contentKind: kind,
      adapter: kind === "data" ? "http" : "generative",
      videoMode,
      videoProvider: ["veo", "sora", "runway"].includes(p.videoProvider) ? p.videoProvider : base.videoProvider,
      style,
      styleRationale: String(p.styleRationale ?? base.styleRationale),
      voiceProvider: ["elevenlabs", "openai", "google"].includes(p.voiceProvider) ? p.voiceProvider : base.voiceProvider,
      textProvider: base.textProvider,
      formats: Array.isArray(p.formats) && p.formats.length ? p.formats : base.formats,
      monetization: p.monetization?.primary ? p.monetization : base.monetization,
      dataSourceHint: p.dataSourceHint ? String(p.dataSourceHint) : undefined,
      rationale: String(p.rationale ?? base.rationale),
    };
  } catch {
    return base;
  }
}
