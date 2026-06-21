import type { ContentPayload } from "../../core/types/index.js";

export interface QualityScore {
  score: number; // 0..100
  factors: string[];
}

/**
 * Content quality score (0-100) from payload richness: a strong hook, enough data,
 * body, an actionable recommendation, context, attribution and verified facts. Used to
 * rank content and (optionally) warn on thin pieces.
 */
export function qualityScore(p: ContentPayload): QualityScore {
  let s = 0;
  const f: string[] = [];
  const hookLen = p.headlineFact.trim().length;
  if (hookLen >= 20 && hookLen <= 90) { s += 20; } else { f.push("hook fuera de longitud ideal (20-90)"); s += 8; }
  if (p.keyMetrics.length >= 2) s += 18; else f.push("pocas métricas");
  if (p.segments.length >= 2) s += 18; else f.push("cuerpo corto");
  if (p.recommendation && p.recommendation.items.length > 0) s += 16; else f.push("sin recomendación accionable");
  if (p.context && p.context.length > 20) s += 8; else f.push("sin contexto");
  if (p.sourceRef?.url) s += 8; else f.push("sin URL de fuente");
  if (p.safety.factsVerified) s += 12; else f.push("hechos no verificados");
  return { score: Math.min(100, s), factors: f };
}
