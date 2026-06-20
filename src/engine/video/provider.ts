export interface VideoClipRequest {
  prompt: string;
  negativePrompt?: string;
  seconds: number;
  aspectRatio: string; // "9:16" | "16:9" | "1:1"
  resolution: "720p" | "1080p" | "4k";
  outPath: string; // target .mp4
  /** Ask the model to also generate audio (Veo). */
  nativeAudio: boolean;
}

export interface VideoClipResult {
  path: string;
  mimeType: string;
  durationSec: number;
  hasAudio: boolean;
}

/**
 * VideoProvider — one implementation per generative-video vendor. All are async
 * job-based (submit → poll → download); they share this interface so the channel
 * config picks the provider without the pipeline knowing the difference.
 */
export interface VideoProvider {
  readonly name: string;
  /** True only when credentials are present; otherwise the engine uses the stub. */
  available(): boolean;
  generateClip(req: VideoClipRequest): Promise<VideoClipResult>;
}

/** Map (aspectRatio, resolution) → "WxH". */
export function pixelSize(aspectRatio: string, resolution: "720p" | "1080p" | "4k"): { w: number; h: number } {
  const longEdge = resolution === "4k" ? 2160 : resolution === "1080p" ? 1080 : 720;
  switch (aspectRatio) {
    case "9:16":
      return { w: longEdge, h: Math.round((longEdge * 16) / 9) };
    case "1:1":
      return { w: longEdge, h: longEdge };
    case "16:9":
    default:
      return { w: Math.round((longEdge * 16) / 9), h: longEdge };
  }
}

/** Generic async polling helper with timeout. */
export async function poll<T>(
  fn: () => Promise<{ done: boolean; value?: T }>,
  opts: { everyMs: number; timeoutMs: number },
): Promise<T> {
  const start = Date.now();
  for (;;) {
    const { done, value } = await fn();
    if (done && value !== undefined) return value;
    if (Date.now() - start > opts.timeoutMs) throw new Error("video provider: polling timed out");
    await new Promise((r) => setTimeout(r, opts.everyMs));
  }
}
