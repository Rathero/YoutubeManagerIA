import { downloadTo } from "./download.js";
import { pixelSize, poll, type VideoClipRequest, type VideoClipResult, type VideoProvider } from "./provider.js";

/**
 * OpenAI Sora 2. Async Videos API: POST /v1/videos → poll GET /v1/videos/{id} →
 * download /v1/videos/{id}/content. Cinematic, strong physics/camera.
 *
 * Override model with FACTORY_SORA_MODEL (sora-2 | sora-2-pro).
 * Docs: https://developers.openai.com/api/docs/guides/video-generation
 */
export class SoraVideoProvider implements VideoProvider {
  readonly name = "sora";
  private key = process.env.OPENAI_API_KEY ?? "";
  private model = process.env.FACTORY_SORA_MODEL ?? "sora-2";
  private base = process.env.FACTORY_OPENAI_BASE ?? "https://api.openai.com/v1";

  available(): boolean {
    return this.key.length > 0;
  }

  async generateClip(req: VideoClipRequest): Promise<VideoClipResult> {
    const { w, h } = pixelSize(req.aspectRatio, req.resolution === "4k" ? "1080p" : req.resolution);
    const startRes = await fetch(`${this.base}/videos`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.key}` },
      body: JSON.stringify({ model: this.model, prompt: req.prompt, size: `${w}x${h}`, seconds: String(req.seconds) }),
    });
    if (!startRes.ok) throw new Error(`Sora create ${startRes.status}: ${await startRes.text()}`);
    const job = (await startRes.json()) as { id: string };

    await poll<true>(
      async () => {
        const r = await fetch(`${this.base}/videos/${job.id}`, { headers: { authorization: `Bearer ${this.key}` } });
        if (!r.ok) throw new Error(`Sora poll ${r.status}: ${await r.text()}`);
        const j = (await r.json()) as { status: string; error?: unknown };
        if (j.status === "completed") return { done: true, value: true };
        if (j.status === "failed") throw new Error(`Sora failed: ${JSON.stringify(j.error)}`);
        return { done: false };
      },
      { everyMs: 8000, timeoutMs: 12 * 60 * 1000 },
    );

    await downloadTo(`${this.base}/videos/${job.id}/content`, req.outPath, { authorization: `Bearer ${this.key}` });
    return { path: req.outPath, mimeType: "video/mp4", durationSec: req.seconds, hasAudio: true };
  }
}
