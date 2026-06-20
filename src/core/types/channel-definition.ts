import { z } from "zod";

/**
 * ChannelDefinition — the declarative description of an entire channel.
 *
 * This is the piece that makes the whole system agnostic. The Engine knows nothing
 * about "luz"; it only reads this. Everything channel-specific lives here (data) plus
 * a NicheAdapter (domain logic). Adding a channel = a config (+ an adapter if the data
 * source is new). Zero changes to the core.
 */

export const FormatKind = z.enum(["short", "long", "weekly", "square"]);
export type FormatKind = z.infer<typeof FormatKind>;

const PaletteSchema = z.object({
  cheap: z.string().optional(),
  mid: z.string().optional(),
  expensive: z.string().optional(),
  bg: z.string(),
  fg: z.string(),
  accent: z.string().optional(),
});

const BrandSchema = z.object({
  palette: PaletteSchema,
  fonts: z.object({ heading: z.string(), body: z.string() }),
  logo_asset: z.string().optional(),
  visual_template: z.string().default("data-card-v1"),
});

const VoicePersonaSchema = z.object({
  description: z.string(),
  do: z.array(z.string()).default([]),
  dont: z.array(z.string()).default([]),
});

const IdentitySchema = z.object({
  name: z.string(),
  language: z.string(),
  region: z.string(),
  brand: BrandSchema,
  voice_persona: VoicePersonaSchema,
});

const MonetizationSchema = z.object({
  primary: z.enum(["affiliate", "adsense", "product", "mixed"]),
  affiliate_verticals: z.array(z.string()).default([]),
  product_idea: z.string().optional(),
});

const NicheSchema = z.object({
  topic: z.string(),
  audience: z.string(),
  value_proposition: z.string(),
  monetization: MonetizationSchema,
});

const FreshnessSchema = z.object({
  type: z.string(),
  available_after: z.string().optional(),
  confirm_field: z.string().optional(),
});

const DataSchema = z.object({
  /** Folder name under /adapters. The registry resolves this to a NicheAdapter. */
  adapter: z.string(),
  freshness: FreshnessSchema,
  /** Free-form, adapter-specific parameters. Validated by the adapter, not the core. */
  config: z.record(z.unknown()).default({}),
});

const FormatSchema = z.object({
  kind: FormatKind,
  enabled: z.boolean().default(true),
  target_seconds: z.number().int().positive().optional(),
  /** Ordered section keys; the render maps section → scene. */
  structure: z.array(z.string()).default([]),
  /** For weekly/cron-style formats. */
  schedule: z.string().optional(),
});

const ScriptSchema = z.object({
  prompt_template: z.string(),
  max_words: z.record(z.number().int().positive()).default({}),
  language_rules: z.string().optional(),
});

const VoiceSchema = z.object({
  provider: z.enum(["elevenlabs", "azure", "piper", "stub"]).default("stub"),
  voice_id: z.string().optional(),
  speed: z.number().positive().default(1),
});

const RenderSchema = z.object({
  engine: z.enum(["remotion", "ffmpeg", "stub"]).default("ffmpeg"),
  template: z.string().default("data-card-v1"),
  aspect_ratios: z.array(z.string()).default(["9:16"]),
  music: z
    .object({
      enabled: z.boolean().default(false),
      library: z.string().optional(),
      volume_db: z.number().optional(),
    })
    .default({ enabled: false }),
});

const PlatformSchema = z.object({
  id: z.enum(["youtube", "tiktok", "instagram"]),
  enabled: z.boolean().default(true),
  account_ref: z.string(),
  posts: z.array(FormatKind).default([]),
  /** map of formatKind -> "HH:mm" or "DOW HH:mm". */
  publish_times: z.record(z.string()).default({}),
  /** auto = direct post via approved app; assisted = drop into one-tap queue. */
  mode: z.enum(["auto", "assisted"]).default("assisted"),
});

const TriggerSchema = z.object({
  type: z.enum(["time_with_data_gate", "pure_cron", "event"]),
  at: z.string().optional(),
  retry_every_min: z.number().int().positive().optional(),
  give_up_at: z.string().optional(),
});

const ScheduleSchema = z.object({
  timezone: z.string().default("UTC"),
  trigger: TriggerSchema,
});

const KpisSchema = z.object({
  targets: z.record(z.number()).default({}),
  review_after_days: z.number().int().positive().default(28),
});

export const ChannelDefinitionSchema = z.object({
  id: z.string(),
  status: z.enum(["draft", "active", "paused", "archived"]).default("draft"),
  version: z.number().int().positive().default(1),
  identity: IdentitySchema,
  niche: NicheSchema,
  data: DataSchema,
  formats: z.array(FormatSchema).min(1),
  script: ScriptSchema,
  voice: VoiceSchema,
  render: RenderSchema,
  platforms: z.array(PlatformSchema).default([]),
  distribution_own: z
    .object({
      newsletter: z
        .object({ enabled: z.boolean().default(false), provider: z.string().optional() })
        .optional(),
      telegram_bot: z
        .object({ enabled: z.boolean().default(false) })
        .optional(),
    })
    .optional(),
  schedule: ScheduleSchema,
  kpis: KpisSchema.optional(),
});

export type ChannelDefinition = z.infer<typeof ChannelDefinitionSchema>;
export type Platform = z.infer<typeof PlatformSchema>;
export type Format = z.infer<typeof FormatSchema>;
