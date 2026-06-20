import { z } from "zod";

/**
 * ContentPayload — the "common language" between a NicheAdapter and the Engine.
 *
 * Every niche produces this shape; the Engine renders this shape. This is where
 * the agnostic magic lives: the engine never knows about "electricity prices" or
 * "AI release digests" — it only knows hook → cards → body → chart → recommendation → CTA.
 *
 * INVARIANT: every factual number in here is produced deterministically by the
 * adapter's `analyze()`. The LLM later turns these into prose but never originates them.
 */

export const MetricSchema = z.object({
  label: z.string(),
  value: z.union([z.string(), z.number()]),
  unit: z.string().optional(),
  /** Visual emphasis hint for the renderer. */
  emphasis: z.enum(["primary", "secondary", "muted"]).default("secondary"),
});
export type Metric = z.infer<typeof MetricSchema>;

export const SegmentSchema = z.object({
  title: z.string(),
  detail: z.string(),
  /** Optional key into visualData/keyMetrics so the renderer can cross-reference. */
  dataRef: z.string().optional(),
});
export type Segment = z.infer<typeof SegmentSchema>;

export const ComparisonSchema = z.object({
  label: z.string(),
  deltaPct: z.number().optional(),
  direction: z.enum(["up", "down", "flat"]),
});
export type Comparison = z.infer<typeof ComparisonSchema>;

export const RecommendationItemSchema = z.object({
  label: z.string(),
  /** Human-readable window, e.g. "03:00–06:00" or "después de las 14h". */
  window: z.string(),
});

export const RecommendationSchema = z.object({
  headline: z.string(),
  items: z.array(RecommendationItemSchema),
});
export type Recommendation = z.infer<typeof RecommendationSchema>;

export const VisualDataSchema = z.object({
  type: z.enum(["timeseries", "bars", "ranking"]),
  series: z.array(
    z.object({
      x: z.union([z.string(), z.number()]),
      y: z.number(),
    }),
  ),
  highlight: z
    .object({
      min: z.unknown().optional(),
      max: z.unknown().optional(),
    })
    .optional(),
});
export type VisualData = z.infer<typeof VisualDataSchema>;

export const SourceRefSchema = z.object({
  name: z.string(),
  url: z.string().url().optional(),
});

export const SafetySchema = z.object({
  /** QA gate reads this. Adapters MUST set it true only when facts are real & fresh. */
  factsVerified: z.boolean(),
  notes: z.string().optional(),
  /** Niche-declared risks that force human review (e.g. legal-sensitive niches). */
  riskNotes: z.array(z.string()).optional(),
});

export const ContentPayloadSchema = z.object({
  channelId: z.string(),
  /** ISO date of the content (the "day" this payload is about). */
  date: z.string(),
  /** Drives color/tone in the render, e.g. "barato" | "caro". */
  classification: z.string().optional(),

  /** The factual hook. e.g. "Mañana la luz baja un 18%". */
  headlineFact: z.string(),
  keyMetrics: z.array(MetricSchema),
  segments: z.array(SegmentSchema),
  comparison: ComparisonSchema.optional(),
  recommendation: RecommendationSchema.optional(),
  /** The "why" — optional free context the LLM may expand. */
  context: z.string().optional(),
  visualData: VisualDataSchema.optional(),
  cta: z.string().optional(),
  sourceRef: SourceRefSchema,
  safety: SafetySchema,
});

export type ContentPayload = z.infer<typeof ContentPayloadSchema>;
