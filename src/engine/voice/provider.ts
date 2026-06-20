import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface TtsRequest {
  text: string;
  voiceId?: string;
  speed: number;
  outPath: string;
}
export interface TtsResult {
  path: string;
  durationSec: number;
  textHash: string;
}

export interface TtsProvider {
  readonly name: string;
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

/** Writes a valid mono 16-bit PCM WAV of `seconds` of silence at 24kHz. */
async function writeSilentWav(path: string, seconds: number): Promise<void> {
  const sampleRate = 24000;
  const numSamples = Math.ceil(seconds * sampleRate);
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, buffer);
}

/**
 * Stub TTS provider — no external service. Produces a real (silent) WAV sized to the
 * estimated narration length, plus a sidecar .txt with the spoken text. Lets the rest
 * of the pipeline (render/QA) run end-to-end offline. Swap for ElevenLabs/Piper later.
 */
export class StubTtsProvider implements TtsProvider {
  readonly name = "stub";
  async synthesize(req: TtsRequest): Promise<TtsResult> {
    const durationSec = estimateDuration(req.text, req.speed);
    await writeSilentWav(req.outPath, durationSec);
    await writeFile(`${req.outPath}.txt`, req.text, "utf8");
    return { path: req.outPath, durationSec, textHash: hashText(req.text) };
  }
}

export function getTtsProvider(provider: string): TtsProvider {
  switch (provider) {
    // Real providers are extension points; they implement the same interface.
    case "elevenlabs":
    case "azure":
    case "piper":
    case "stub":
    default:
      return new StubTtsProvider();
  }
}
