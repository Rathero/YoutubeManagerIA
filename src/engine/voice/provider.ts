import { exec } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";
import type { VoiceConfig } from "../../core/types/index.js";

const pexec = promisify(exec);

export interface TtsRequest {
  text: string;
  outPath: string; // extension hints the container; providers may change it
}
export interface TtsResult {
  path: string;
  durationSec: number;
  textHash: string;
}

export interface TtsProvider {
  readonly name: string;
  /** True only when credentials are present. */
  available(): boolean;
  synthesize(req: TtsRequest): Promise<TtsResult>;
}

export function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

/** Rough narration duration: ~2.6 words/sec in Spanish, scaled by speaking speed. */
export function estimateDuration(text: string, speed: number): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round((words / (2.6 * speed)) * 10) / 10);
}

/** Probe real audio duration with ffprobe; falls back to a text estimate. */
async function probeDuration(path: string, fallbackText: string, speed: number): Promise<number> {
  try {
    const { stdout } = await pexec(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${path}"`,
    );
    const d = Number.parseFloat(stdout.trim());
    if (Number.isFinite(d) && d > 0) return Math.round(d * 10) / 10;
  } catch {
    /* ffprobe absent */
  }
  return estimateDuration(fallbackText, speed);
}

async function writeBytes(path: string, bytes: ArrayBuffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, Buffer.from(bytes));
}

/** Writes a valid mono 16-bit PCM WAV from raw PCM (or silence) at the given rate. */
async function writeWav(path: string, pcm: Buffer, sampleRate = 24000): Promise<void> {
  const dataSize = pcm.length;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, Buffer.concat([header, pcm]));
}

// ── Stub ──────────────────────────────────────────────────────────────────────

/** No external service: a silent WAV sized to the estimated narration length. */
export class StubTtsProvider implements TtsProvider {
  readonly name = "stub";
  constructor(private speed: number) {}
  available(): boolean {
    return true;
  }
  async synthesize(req: TtsRequest): Promise<TtsResult> {
    const durationSec = estimateDuration(req.text, this.speed);
    const path = req.outPath.replace(/\.[^.]+$/, ".wav");
    await writeWav(path, Buffer.alloc(Math.ceil(durationSec * 24000) * 2));
    await writeFile(`${path}.txt`, req.text, "utf8");
    return { path, durationSec, textHash: hashText(req.text) };
  }
}

// ── ElevenLabs (most realistic) ─────────────────────────────────────────────────

export class ElevenLabsProvider implements TtsProvider {
  readonly name = "elevenlabs";
  private key = process.env.ELEVENLABS_API_KEY ?? "";
  constructor(private cfg: VoiceConfig) {}
  available(): boolean {
    return this.key.length > 0 && Boolean(this.cfg.voice_id);
  }
  async synthesize(req: TtsRequest): Promise<TtsResult> {
    const voiceId = this.cfg.voice_id!;
    const model = this.cfg.model_id ?? "eleven_v3";
    const path = req.outPath.replace(/\.[^.]+$/, ".mp3");
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "xi-api-key": this.key },
        body: JSON.stringify({
          text: req.text,
          model_id: model,
          voice_settings: {
            stability: this.cfg.stability ?? 0.4,
            similarity_boost: this.cfg.similarity ?? 0.8,
            style: this.cfg.style_exaggeration ?? 0.3,
            use_speaker_boost: true,
          },
        }),
      },
    );
    if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
    await writeBytes(path, await res.arrayBuffer());
    return { path, durationSec: await probeDuration(path, req.text, this.cfg.speed), textHash: hashText(req.text) };
  }
}

// ── OpenAI TTS ──────────────────────────────────────────────────────────────────

export class OpenAITtsProvider implements TtsProvider {
  readonly name = "openai";
  private key = process.env.OPENAI_API_KEY ?? "";
  private base = process.env.FACTORY_OPENAI_BASE ?? "https://api.openai.com/v1";
  constructor(private cfg: VoiceConfig) {}
  available(): boolean {
    return this.key.length > 0;
  }
  async synthesize(req: TtsRequest): Promise<TtsResult> {
    const path = req.outPath.replace(/\.[^.]+$/, ".mp3");
    const res = await fetch(`${this.base}/audio/speech`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.key}` },
      body: JSON.stringify({
        model: this.cfg.model_id ?? "gpt-4o-mini-tts",
        voice: this.cfg.voice_id ?? "alloy",
        input: req.text,
        response_format: "mp3",
        speed: this.cfg.speed,
        ...(this.cfg.emotion ? { instructions: this.cfg.emotion } : {}),
      }),
    });
    if (!res.ok) throw new Error(`OpenAI TTS ${res.status}: ${await res.text()}`);
    await writeBytes(path, await res.arrayBuffer());
    return { path, durationSec: await probeDuration(path, req.text, this.cfg.speed), textHash: hashText(req.text) };
  }
}

// ── Google Gemini TTS ────────────────────────────────────────────────────────────

export class GoogleTtsProvider implements TtsProvider {
  readonly name = "google";
  private key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
  private base = process.env.FACTORY_GEMINI_BASE ?? "https://generativelanguage.googleapis.com/v1beta";
  constructor(private cfg: VoiceConfig) {}
  available(): boolean {
    return this.key.length > 0;
  }
  async synthesize(req: TtsRequest): Promise<TtsResult> {
    const model = this.cfg.model_id ?? "gemini-2.5-flash-preview-tts";
    const path = req.outPath.replace(/\.[^.]+$/, ".wav");
    const res = await fetch(`${this.base}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": this.key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: req.text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: this.cfg.voice_id ?? "Kore" } } },
        },
      }),
    });
    if (!res.ok) throw new Error(`Google TTS ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as any;
    const b64 = json.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data as string | undefined;
    if (!b64) throw new Error("Google TTS: no audio in response");
    await writeWav(path, Buffer.from(b64, "base64"), 24000); // L16 PCM @ 24kHz
    return { path, durationSec: await probeDuration(path, req.text, this.cfg.speed), textHash: hashText(req.text) };
  }
}

/**
 * Resolve the configured TTS provider, falling back to the stub when its credentials
 * are missing so the pipeline always runs.
 */
export function getTtsProvider(cfg: VoiceConfig): { provider: TtsProvider; fellBack: boolean } {
  let provider: TtsProvider;
  switch (cfg.provider) {
    case "elevenlabs":
      provider = new ElevenLabsProvider(cfg);
      break;
    case "openai":
      provider = new OpenAITtsProvider(cfg);
      break;
    case "google":
      provider = new GoogleTtsProvider(cfg);
      break;
    default:
      provider = new StubTtsProvider(cfg.speed);
  }
  if (provider.available()) return { provider, fellBack: false };
  return { provider: new StubTtsProvider(cfg.speed), fellBack: cfg.provider !== "stub" && cfg.provider !== "azure" && cfg.provider !== "piper" };
}
