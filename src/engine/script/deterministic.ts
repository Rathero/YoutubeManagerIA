import type { ContentPayload, Format, FormatScript } from "../../core/types/index.js";

/**
 * Maps an arbitrary section key (from ChannelDefinition.formats[].structure) to a
 * generic narrative role. This keeps the deterministic generator niche-agnostic:
 * it works for "hook/dato_clave/..." (luz) or "intro/titulares/..." (any other niche).
 */
function sectionRole(key: string): string {
  const k = key.toLowerCase();
  if (/(hook|intro|resumen|apertura)/.test(k)) return "hook";
  if (/(dato|metric|grafico|grafica|key|cifra)/.test(k)) return "metrics";
  if (/(compar|tendencia|delta|vs)/.test(k)) return "comparison";
  if (/(consejo|recom|accion|aconsej)/.test(k)) return "recommendation";
  if (/(contexto|porque|por_que|why|motivo)/.test(k)) return "context";
  if (/(cta|sigue|suscri|preview|cierre)/.test(k)) return "cta";
  return "body";
}

function metricsText(p: ContentPayload): string {
  return p.keyMetrics
    .map((m) => `${m.label}: ${m.value}${m.unit ? " " + m.unit : ""}`)
    .join(". ");
}

function bodyText(p: ContentPayload): string {
  return p.segments.map((s) => `${s.title}: ${s.detail}`).join(". ");
}

function comparisonText(p: ContentPayload): string {
  if (!p.comparison) return p.context ?? "";
  const dir = p.comparison.direction === "up" ? "más caro" : p.comparison.direction === "down" ? "más barato" : "estable";
  const pct = p.comparison.deltaPct !== undefined ? ` (${p.comparison.deltaPct}%)` : "";
  return `${p.comparison.label}: ${dir}${pct}.`;
}

function recommendationText(p: ContentPayload): string {
  if (!p.recommendation) return "";
  const items = p.recommendation.items.map((i) => `${i.label} → ${i.window}`).join("; ");
  return `${p.recommendation.headline}: ${items}.`;
}

function roleText(role: string, p: ContentPayload): string {
  switch (role) {
    case "hook":
      return p.headlineFact;
    case "metrics":
      return metricsText(p);
    case "comparison":
      return comparisonText(p);
    case "recommendation":
      return recommendationText(p);
    case "context":
      return p.context ?? "";
    case "cta":
      return p.cta ?? "";
    default:
      return bodyText(p);
  }
}

function clampWords(text: string, maxWords?: number): string {
  if (!maxWords) return text;
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(" ") + "…";
}

/**
 * Deterministic, no-LLM script generation. Always available so the pipeline runs
 * offline / without API keys. The LLM path produces nicer prose from the same data.
 */
export function deterministicScript(
  payload: ContentPayload,
  format: Format,
  maxWords?: number,
): FormatScript {
  const structure = format.structure.length > 0 ? format.structure : ["hook", "body", "cta"];
  const sections: Record<string, string> = {};
  for (const key of structure) {
    sections[key] = roleText(sectionRole(key), payload);
  }
  const narrationRaw = structure
    .map((k) => sections[k])
    .filter((t): t is string => Boolean(t && t.trim()))
    .join(" ");
  const narration = clampWords(narrationRaw, maxWords);
  return {
    format: format.kind,
    sections,
    narration,
    wordCount: narration.split(/\s+/).filter(Boolean).length,
  };
}
