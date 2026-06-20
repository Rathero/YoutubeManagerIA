import type { ContentPayload, FormatScript, VideoConfig } from "../../core/types/index.js";
import type { LlmClient } from "../llm/client.js";
import type { Shot } from "./style.js";

export interface Storyboard {
  format: string;
  shots: Shot[];
  totalSeconds: number;
}

/** Split a narration string into ~n roughly-equal chunks on sentence boundaries. */
function chunkNarration(text: string, n: number): string[] {
  const sentences = text.split(/(?<=[.!?…])\s+/).filter(Boolean);
  if (sentences.length === 0) return [text];
  if (n >= sentences.length) return sentences;
  const out: string[] = [];
  const per = Math.ceil(sentences.length / n);
  for (let i = 0; i < sentences.length; i += per) out.push(sentences.slice(i, i + per).join(" "));
  return out;
}

/** Deterministic storyboard: one shot per narration chunk, generic scene from payload. */
export function deterministicStoryboard(
  payload: ContentPayload,
  script: FormatScript,
  video: VideoConfig,
): Storyboard {
  const clip = video.clip_seconds;
  const sectionTexts = Object.values(script.sections).filter((t) => t && t.trim());
  const baseChunks = sectionTexts.length > 0 ? sectionTexts : chunkNarration(script.narration, video.max_clips);
  const chunks = baseChunks.slice(0, video.max_clips);

  const sceneFor = (i: number, chunk: string): string => {
    if (i === 0) return `An establishing scene that visually represents: "${payload.headlineFact}". Topic: ${payload.channelId}.`;
    if (payload.recommendation && /(\d|→|window|franja|hora)/i.test(chunk)) {
      return `A scene illustrating a practical recommendation about the topic, evoking: "${chunk.slice(0, 120)}".`;
    }
    return `A scene that visually conveys the idea: "${chunk.slice(0, 140)}".`;
  };

  const shots: Shot[] = chunks.map((chunk, i) => ({
    index: i,
    seconds: clip,
    narration: chunk,
    scene: sceneFor(i, chunk),
  }));

  return { format: script.format, shots, totalSeconds: shots.length * clip };
}

const STORYBOARD_SYSTEM = `You are a video director planning shots for a short, faceless social video.
Given a narration and structured data, return ONLY a JSON array of shots:
[{ "scene": string, "narration": string }]
Rules:
- "scene" is a vivid VISUAL description of what is on screen (no on-screen text, no captions). Describe subjects, setting, action, mood — NOT the data values themselves.
- "narration" is the spoken line(s) for that shot, taken from the provided narration (do not invent new facts).
- Keep the number of shots within the requested maximum. Cover the whole narration in order.
- No markdown, no prose outside the JSON array.`;

export async function llmStoryboard(
  client: LlmClient,
  payload: ContentPayload,
  script: FormatScript,
  video: VideoConfig,
  styleHint: string,
): Promise<Storyboard> {
  const targetShots = Math.min(video.max_clips, Math.max(2, Math.ceil(script.narration.split(/\s+/).length / 22)));
  const user = [
    `Style: ${styleHint}.`,
    `Max shots: ${targetShots}. Each shot ~${video.clip_seconds}s.`,
    `Narration:\n${script.narration}`,
    "",
    "Structured data (for grounding, do not put numbers on screen):",
    JSON.stringify({ headlineFact: payload.headlineFact, keyMetrics: payload.keyMetrics, recommendation: payload.recommendation }),
    "",
    "Return the JSON array of shots.",
  ].join("\n");

  const raw = await client.complete({ system: STORYBOARD_SYSTEM, user, maxTokens: 1500 });
  const json = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const parsed = JSON.parse(json) as Array<{ scene: string; narration: string }>;
  const shots: Shot[] = parsed.slice(0, video.max_clips).map((s, i) => ({
    index: i,
    seconds: video.clip_seconds,
    narration: String(s.narration ?? "").trim(),
    scene: String(s.scene ?? "").trim(),
  }));
  if (shots.length === 0) throw new Error("llmStoryboard: empty board");
  return { format: script.format, shots, totalSeconds: shots.length * video.clip_seconds };
}

export async function buildStoryboard(
  client: LlmClient | null,
  payload: ContentPayload,
  script: FormatScript,
  video: VideoConfig,
  styleHint: string,
): Promise<Storyboard> {
  if (client && video.llm_storyboard) {
    try {
      return await llmStoryboard(client, payload, script, video, styleHint);
    } catch {
      // fall through to deterministic
    }
  }
  return deterministicStoryboard(payload, script, video);
}
