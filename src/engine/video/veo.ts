import { downloadTo } from "./download.js";
import { poll, type VideoClipRequest, type VideoClipResult, type VideoProvider } from "./provider.js";

/**
 * Google Veo 3.1 via the Gemini API. Native audio + 9:16/16:9 + up to 4K. Long-running:
 * predictLongRunning → poll the operation → download the generated sample.
 *
 * Endpoints/model ids drift; override with FACTORY_VEO_MODEL / FACTORY_VEO_BASE.
 * Docs: https://ai.google.dev/gemini-api/docs/video
 */
export class VeoVideoProvider implements VideoProvider {
  readonly name = "veo";
  private key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
  private model = process.env.FACTORY_VEO_MODEL ?? "veo-3.1-generate-001";
  private base = process.env.FACTORY_VEO_BASE ?? "https://generativelanguage.googleapis.com/v1beta";

  available(): boolean {
    return this.key.length > 0;
  }

  async generateClip(req: VideoClipRequest): Promise<VideoClipResult> {
    const resolution = req.resolution === "4k" ? "1080p" : req.resolution;
    const body = {
      instances: [{ prompt: req.prompt }],
      parameters: {
        aspectRatio: req.aspectRatio === "9:16" ? "9:16" : "16:9",
        durationSeconds: req.seconds,
        resolution,
        ...(req.negativePrompt ? { negativePrompt: req.negativePrompt } : {}),
        generateAudio: req.nativeAudio,
      },
    };

    const startRes = await fetch(`${this.base}/models/${this.model}:predictLongRunning`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": this.key },
      body: JSON.stringify(body),
    });
    if (!startRes.ok) throw new Error(`Veo start ${startRes.status}: ${await startRes.text()}`);
    const op = (await startRes.json()) as { name: string };

    const uri = await poll<string>(
      async () => {
        const r = await fetch(`${this.base}/${op.name}`, { headers: { "x-goog-api-key": this.key } });
        if (!r.ok) throw new Error(`Veo poll ${r.status}: ${await r.text()}`);
        const j = (await r.json()) as any;
        if (!j.done) return { done: false };
        if (j.error) throw new Error(`Veo failed: ${JSON.stringify(j.error)}`);
        const sample = j.response?.generateVideoResponse?.generatedSamples?.[0];
        const u = sample?.video?.uri as string | undefined;
        if (!u) throw new Error("Veo: no video uri in completed operation");
        return { done: true, value: u };
      },
      { everyMs: 10000, timeoutMs: 10 * 60 * 1000 },
    );

    await downloadTo(uri, req.outPath, { "x-goog-api-key": this.key });
    return { path: req.outPath, mimeType: "video/mp4", durationSec: req.seconds, hasAudio: req.nativeAudio };
  }
}
