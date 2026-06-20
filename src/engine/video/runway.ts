import { downloadTo } from "./download.js";
import { poll, type VideoClipRequest, type VideoClipResult, type VideoProvider } from "./provider.js";

/** Runway uses pixel ratios; map our aspect ratio to the nearest supported one. */
function runwayRatio(aspect: string): string {
  if (aspect === "9:16") return "720:1280";
  if (aspect === "1:1") return "960:960";
  return "1280:720";
}

/**
 * Runway Gen-4 (text→video). Task-based: POST /v1/text_to_video → poll GET /v1/tasks/{id}.
 * The pro favorite for camera control and character consistency.
 *
 * Override model with FACTORY_RUNWAY_MODEL (gen4_turbo | gen4). Duration is 5 or 10s.
 * Docs: https://docs.dev.runwayml.com/
 */
export class RunwayVideoProvider implements VideoProvider {
  readonly name = "runway";
  private key = process.env.RUNWAY_API_KEY ?? process.env.RUNWAYML_API_SECRET ?? "";
  private model = process.env.FACTORY_RUNWAY_MODEL ?? "gen4_turbo";
  private base = process.env.FACTORY_RUNWAY_BASE ?? "https://api.dev.runwayml.com/v1";
  private version = process.env.FACTORY_RUNWAY_VERSION ?? "2024-11-06";

  available(): boolean {
    return this.key.length > 0;
  }

  async generateClip(req: VideoClipRequest): Promise<VideoClipResult> {
    const duration = req.seconds >= 8 ? 10 : 5;
    const headers = {
      "content-type": "application/json",
      authorization: `Bearer ${this.key}`,
      "X-Runway-Version": this.version,
    };
    const startRes = await fetch(`${this.base}/text_to_video`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: this.model,
        promptText: req.prompt,
        ratio: runwayRatio(req.aspectRatio),
        duration,
      }),
    });
    if (!startRes.ok) throw new Error(`Runway create ${startRes.status}: ${await startRes.text()}`);
    const task = (await startRes.json()) as { id: string };

    const url = await poll<string>(
      async () => {
        const r = await fetch(`${this.base}/tasks/${task.id}`, { headers });
        if (!r.ok) throw new Error(`Runway poll ${r.status}: ${await r.text()}`);
        const j = (await r.json()) as { status: string; output?: string[]; failure?: string };
        if (j.status === "SUCCEEDED") {
          const out = j.output?.[0];
          if (!out) throw new Error("Runway: no output url");
          return { done: true, value: out };
        }
        if (j.status === "FAILED") throw new Error(`Runway failed: ${j.failure ?? "unknown"}`);
        return { done: false };
      },
      { everyMs: 8000, timeoutMs: 12 * 60 * 1000 },
    );

    await downloadTo(url, req.outPath);
    return { path: req.outPath, mimeType: "video/mp4", durationSec: duration, hasAudio: false };
  }
}
