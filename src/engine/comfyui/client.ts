import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Minimal ComfyUI client. ComfyUI is the de-facto way to run local image/video models
 * (FLUX, SDXL, Wan 2.2, LTX-Video, HunyuanVideo). The user exports a workflow in
 * "API format" with placeholder tokens; we fill them, queue the prompt, poll history,
 * and download the produced asset. Everything stays local → $0 inference.
 *
 * Template tokens replaced in the workflow JSON: {{PROMPT}} {{NEGATIVE}} {{WIDTH}}
 * {{HEIGHT}} {{SEED}} {{SECONDS}} {{FPS}}.
 */
export interface ComfyReplacements {
  PROMPT: string;
  NEGATIVE?: string;
  WIDTH: number;
  HEIGHT: number;
  SEED?: number;
  SECONDS?: number;
  FPS?: number;
}

export interface ComfyFile {
  filename: string;
  subfolder: string;
  type: string;
  kind: "image" | "video";
}

export class ComfyUIClient {
  constructor(private base = process.env.FACTORY_COMFYUI_URL ?? "http://localhost:8188") {}

  /** Fill a workflow template (string with {{TOKENS}}) and parse it to a graph object. */
  static async fillTemplate(templatePath: string, r: ComfyReplacements): Promise<unknown> {
    const raw = await readFile(templatePath, "utf8");
    const seed = r.SEED ?? Math.floor(Math.random() * 1e15);
    const filled = raw
      .replace(/\{\{PROMPT\}\}/g, jsonEscape(r.PROMPT))
      .replace(/\{\{NEGATIVE\}\}/g, jsonEscape(r.NEGATIVE ?? ""))
      .replace(/\{\{WIDTH\}\}/g, String(r.WIDTH))
      .replace(/\{\{HEIGHT\}\}/g, String(r.HEIGHT))
      .replace(/\{\{SEED\}\}/g, String(seed))
      .replace(/\{\{SECONDS\}\}/g, String(r.SECONDS ?? 5))
      .replace(/\{\{FPS\}\}/g, String(r.FPS ?? 24));
    return JSON.parse(filled);
  }

  async queue(workflow: unknown): Promise<string> {
    const res = await fetch(`${this.base}/prompt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: workflow, client_id: randomUUID() }),
    });
    if (!res.ok) throw new Error(`ComfyUI /prompt ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { prompt_id?: string; error?: unknown };
    if (!json.prompt_id) throw new Error(`ComfyUI: no prompt_id (${JSON.stringify(json.error ?? json)})`);
    return json.prompt_id;
  }

  async waitForFiles(promptId: string, opts = { everyMs: 2000, timeoutMs: 15 * 60 * 1000 }): Promise<ComfyFile[]> {
    const start = Date.now();
    for (;;) {
      const res = await fetch(`${this.base}/history/${promptId}`);
      if (res.ok) {
        const hist = (await res.json()) as Record<string, { outputs?: Record<string, any>; status?: any }>;
        const entry = hist[promptId];
        if (entry?.outputs) {
          const files = collectFiles(entry.outputs);
          if (files.length > 0) return files;
        }
      }
      if (Date.now() - start > opts.timeoutMs) throw new Error("ComfyUI: timed out waiting for output");
      await new Promise((r) => setTimeout(r, opts.everyMs));
    }
  }

  async download(file: ComfyFile, outPath: string): Promise<void> {
    const url = `${this.base}/view?filename=${encodeURIComponent(file.filename)}&subfolder=${encodeURIComponent(file.subfolder)}&type=${encodeURIComponent(file.type)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`ComfyUI /view ${res.status}`);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, Buffer.from(await res.arrayBuffer()));
  }

  /** High-level: template → queue → wait → download first matching asset. */
  async run(templatePath: string, r: ComfyReplacements, outPath: string, want: "image" | "video"): Promise<string> {
    const workflow = await ComfyUIClient.fillTemplate(templatePath, r);
    const promptId = await this.queue(workflow);
    const files = await this.waitForFiles(promptId);
    const pick = files.find((f) => f.kind === want) ?? files[0]!;
    await this.download(pick, outPath);
    return outPath;
  }
}

function jsonEscape(s: string): string {
  // Escape so the value can be injected inside a JSON string literal in the template.
  return JSON.stringify(s).slice(1, -1);
}

function collectFiles(outputs: Record<string, any>): ComfyFile[] {
  const files: ComfyFile[] = [];
  for (const node of Object.values(outputs)) {
    for (const img of node.images ?? []) files.push({ ...img, kind: "image" });
    // VHS_VideoCombine / animated outputs surface under gifs/videos.
    for (const v of node.gifs ?? []) files.push({ ...v, kind: "video" });
    for (const v of node.videos ?? []) files.push({ ...v, kind: "video" });
  }
  return files;
}
