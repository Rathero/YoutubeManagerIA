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
  /**
   * What kind of content this channel produces — drives QA strictness:
   *  - data:      grounded in fresh external numbers (QA requires verified facts + metrics)
   *  - knowledge: explainer/curiosities (LLM-authored, sources encouraged)
   *  - story:     narrative/creative (LLM-authored, no external data required)
   */
  content_kind: z.enum(["data", "knowledge", "story"]).default("data"),
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
  /**
   * Text/LLM provider for script + metadata. "local"/"ollama" use a self-hosted
   * OpenAI-compatible server (Ollama, LM Studio, llama.cpp, vLLM) → $0 inference.
   * Falls back to env, then deterministic.
   */
  provider: z
    .object({
      name: z.enum(["anthropic", "openai", "gemini", "local", "ollama", "auto"]).default("auto"),
      model: z.string().optional(),
      /** Override base URL for local/OpenAI-compatible servers. */
      base: z.string().optional(),
    })
    .default({ name: "auto" }),
});

const VoiceSchema = z.object({
  /**
   * "local"/"kokoro" = self-hosted OpenAI-compatible TTS (Kokoro/Speaches/LocalAI);
   * "piper" = local Piper binary. Both run offline for $0.
   */
  provider: z
    .enum(["elevenlabs", "openai", "google", "local", "kokoro", "azure", "piper", "stub"])
    .default("stub"),
  voice_id: z.string().optional(),
  speed: z.number().positive().default(1),
  /** Provider model id (e.g. ElevenLabs "eleven_v3", OpenAI "gpt-4o-mini-tts", "kokoro"). */
  model_id: z.string().optional(),
  /** Local Piper voice model path (.onnx). */
  model_path: z.string().optional(),
  /** Override base URL for local OpenAI-compatible TTS servers. */
  base: z.string().optional(),
  /** Realism/expressiveness knobs (provider-dependent; 0..1). */
  stability: z.number().min(0).max(1).optional(),
  similarity: z.number().min(0).max(1).optional(),
  style_exaggeration: z.number().min(0).max(1).optional(),
  /** Free-form delivery direction passed to expressive models. */
  emotion: z.string().optional(),
});

/**
 * Visual style — drives provider-specific prompt generation for generative video.
 * Built-in keys live in engine/visuals/style.ts; channels can also declare custom
 * styles inline (custom_styles) so the system is open-ended for any aesthetic.
 */
const CustomStyleSchema = z.object({
  /** Core look description injected into every shot prompt. */
  descriptor: z.string(),
  /** Things to avoid (negative prompt), when the provider supports it. */
  negative: z.string().optional(),
  /** Camera/motion guidance. */
  motion: z.string().optional(),
  /** Whether this style depicts photoreal humans (affects safety/disclosure copy). */
  photoreal: z.boolean().default(false),
});

/**
 * Local image generation (FLUX/SDXL via ComfyUI, or cloud). Enables the cheap
 * "images" video mode: one AI image per shot, animated with a Ken Burns pan/zoom.
 */
const ImageSchema = z.object({
  provider: z.enum(["comfyui", "openai", "stub"]).default("stub"),
  model: z.string().optional(),
  /** ComfyUI API-format workflow template (with {{PROMPT}}/{{WIDTH}}… tokens). */
  workflow: z.string().optional(),
  negative: z.string().optional(),
});

const VideoSchema = z.object({
  /**
   * data_card  = rendered data graphics
   * generative = AI-generated footage (Veo/Sora/Runway, or local Wan/LTX/Hunyuan via ComfyUI)
   * images     = AI still per shot (FLUX/SDXL) animated with Ken Burns — cheapest, great local
   */
  mode: z.enum(["data_card", "generative", "images"]).default("data_card"),
  /** "comfyui" = local video models (Wan 2.2 / LTX-Video / HunyuanVideo) for $0. */
  provider: z.enum(["veo", "sora", "runway", "comfyui", "stub"]).default("stub"),
  /** Built-in or custom style key. e.g. realistic | cinematic | anime | manga | comic | cartoon3d | claymation | pixelart | watercolor */
  style: z.string().default("realistic"),
  /** Seconds per generated clip/shot. */
  clip_seconds: z.number().int().positive().default(8),
  resolution: z.enum(["720p", "1080p", "4k"]).default("1080p"),
  /** Use the video model's own generated audio (Veo) instead of TTS. */
  use_native_audio: z.boolean().default(false),
  /** Cap on clips per piece (cost guard). */
  max_clips: z.number().int().positive().default(6),
  /** LLM-built storyboard, or deterministic split when false/no LLM. */
  llm_storyboard: z.boolean().default(true),
  /** ComfyUI text→video workflow template path (for provider: comfyui). */
  workflow: z.string().optional(),
  custom_styles: z.record(CustomStyleSchema).default({}),
});

const RenderSchema = z.object({
  /** generative = use the video providers; ffmpeg/remotion = data-card rendering. */
  engine: z.enum(["remotion", "ffmpeg", "generative", "stub"]).default("ffmpeg"),
  template: z.string().default("data-card-v1"),
  aspect_ratios: z.array(z.string()).default(["9:16"]),
  music: z
    .object({
      enabled: z.boolean().default(false),
      library: z.string().optional(),
      /** Path to a licensed background track to mix under the narration. */
      track: z.string().optional(),
      volume_db: z.number().default(-22),
    })
    .default({ enabled: false, volume_db: -22 }),
  /** Burned-in / sidecar captions. Great for retention on silent-autoplay shorts. */
  captions: z
    .object({
      enabled: z.boolean().default(true),
      burn_in: z.boolean().default(false),
      max_chars_per_line: z.number().int().positive().default(38),
      /** proportional = timed by word share; whisper = align to audio via ASR endpoint. */
      align: z.enum(["proportional", "whisper"]).default("proportional"),
    })
    .default({ enabled: true, burn_in: false, max_chars_per_line: 38, align: "proportional" }),
  /** Auto-generated thumbnail per video (CTR). */
  thumbnails: z
    .object({
      enabled: z.boolean().default(true),
    })
    .default({ enabled: true }),
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
  video: VideoSchema.optional(),
  image: ImageSchema.optional(),
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
  /** Content moderation gate (deterministic blocklist + optional LLM). */
  moderation: z
    .object({
      enabled: z.boolean().default(true),
      blocklist: z.array(z.string()).default([]),
      /** Also run an LLM/OpenAI moderation pass when a client/key is available. */
      llm: z.boolean().default(false),
    })
    .default({ enabled: true, blocklist: [], llm: false }),
  /** A/B testing of titles/thumbnails (rotated per run, attributed via feedback). */
  ab_testing: z
    .object({
      titles: z.boolean().default(true),
    })
    .default({ titles: true }),
});

export type ChannelDefinition = z.infer<typeof ChannelDefinitionSchema>;
export type Platform = z.infer<typeof PlatformSchema>;
export type Format = z.infer<typeof FormatSchema>;
export type VideoConfig = z.infer<typeof VideoSchema>;
export type ImageConfig = z.infer<typeof ImageSchema>;
export type CustomStyle = z.infer<typeof CustomStyleSchema>;
export type VoiceConfig = z.infer<typeof VoiceSchema>;
