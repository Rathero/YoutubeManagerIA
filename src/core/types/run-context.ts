import type { ChannelDefinition, FormatKind } from "./channel-definition.js";
import type { ContentPayload } from "./content-payload.js";

/** A generated script for a single format, broken down by section. */
export interface FormatScript {
  format: FormatKind;
  /** section key (from format.structure) -> text */
  sections: Record<string, string>;
  wordCount: number;
  /** flat narration text used by TTS, derived from sections in order. */
  narration: string;
}

export interface AudioAsset {
  format: FormatKind;
  path: string;
  durationSec: number;
  loudnessLufs?: number;
  /** hash of the narration text, for caching. */
  textHash: string;
}

export interface RenderedAsset {
  format: FormatKind;
  aspectRatio: string;
  path: string;
  durationSec: number;
  mimeType: string;
}

export interface CaptionAsset {
  format: FormatKind;
  /** Path to the .srt file. */
  path: string;
  cueCount: number;
}

export interface ThumbnailAsset {
  format: FormatKind;
  path: string;
  mimeType: string;
  /** A/B variant id (e.g. "A" | "B") when thumbnail testing is on. */
  variant?: string;
}

export type PlatformId = "youtube" | "tiktok" | "instagram" | "x" | "bluesky" | "linkedin";

export interface PlatformMeta {
  platform: PlatformId;
  format: FormatKind;
  title: string;
  description: string;
  hashtags: string[];
  /** YouTube-only: helps mark as a Short, search optimisation, etc. */
  extra?: Record<string, unknown>;
}

export interface PublishResult {
  platform: PlatformId | "newsletter" | "telegram";
  format: FormatKind;
  status: "published" | "queued_assisted" | "skipped" | "failed";
  externalId?: string;
  url?: string;
  queuedItemPath?: string;
  message?: string;
}

export type StageName =
  | "ingest"
  | "compute"
  | "script"
  | "voice"
  | "captions"
  | "moderation"
  | "render"
  | "thumbnail"
  | "metadata"
  | "qa"
  | "publish"
  | "record";

export interface StageRecord {
  stage: StageName;
  status: "ok" | "skipped" | "failed";
  startedAt: string;
  endedAt: string;
  durationMs: number;
  message?: string;
}

/**
 * RunContext — the mutable state threaded through every pipeline stage.
 * Each stage reads what it needs and writes its output back.
 */
export interface RunContext {
  runId: string;
  channel: ChannelDefinition;
  /** ISO date the run targets. */
  date: string;
  /** Timezone-aware "now", injected for testability. */
  now: Date;
  dryRun: boolean;

  // Filled progressively by stages:
  raw?: unknown;
  payload?: ContentPayload;
  scripts?: FormatScript[];
  audio?: AudioAsset[];
  captions?: CaptionAsset[];
  rendered?: RenderedAsset[];
  thumbnails?: ThumbnailAsset[];
  metadata?: PlatformMeta[];
  qa?: { passed: boolean; failures: string[]; warnings: string[] };
  moderation?: { flagged: boolean; reasons: string[] };
  publications?: PublishResult[];

  stageRecords: StageRecord[];
  /** structured logger bound to this run. */
  log: (level: "debug" | "info" | "warn" | "error", msg: string, extra?: Record<string, unknown>) => void;
  /** Resolved text/LLM client for this run (local-first auto), shared by stages + adapters. */
  llm?: import("../../engine/llm/client.js").LlmClient | null;
}

export type RawData = unknown;
