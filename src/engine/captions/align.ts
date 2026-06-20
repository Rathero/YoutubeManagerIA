import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { Cue } from "./srt.js";

/**
 * Align captions to the real audio using a Whisper transcription endpoint
 * (OpenAI-compatible: local faster-whisper/Speaches, or OpenAI). Returns timed cues
 * from the audio's own segments — far more accurate than proportional timing.
 *
 * Endpoint: FACTORY_WHISPER_URL (default local :8000/v1); falls back to OpenAI when a
 * key is present. Throws if unavailable so the caller uses the proportional builder.
 */
export async function transcribeToCues(audioPath: string): Promise<Cue[]> {
  const openaiKey = process.env.OPENAI_API_KEY ?? "";
  const base =
    process.env.FACTORY_WHISPER_URL ?? (openaiKey ? "https://api.openai.com/v1" : "http://localhost:8000/v1");
  const isOpenAI = base.includes("api.openai.com");
  const model = process.env.FACTORY_WHISPER_MODEL ?? (isOpenAI ? "whisper-1" : "Systran/faster-whisper-base");
  const key = isOpenAI ? openaiKey : "local";
  if (isOpenAI && !openaiKey) throw new Error("whisper align: OpenAI selected but OPENAI_API_KEY missing");

  const bytes = await readFile(audioPath);
  const form = new FormData();
  form.append("file", new Blob([bytes]), basename(audioPath));
  form.append("model", model);
  form.append("response_format", "verbose_json");

  const res = await fetch(`${base}/audio/transcriptions`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) throw new Error(`whisper ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { segments?: Array<{ start: number; end: number; text: string }> };
  const segments = json.segments ?? [];
  if (segments.length === 0) throw new Error("whisper: no segments");

  return segments.map((s, i) => ({
    index: i + 1,
    startSec: s.start,
    endSec: s.end,
    text: s.text.trim(),
  }));
}
