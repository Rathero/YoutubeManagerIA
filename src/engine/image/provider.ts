import { exec } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import type { ImageConfig } from "../../core/types/index.js";
import { ComfyUIClient } from "../comfyui/client.js";

const pexec = promisify(exec);

export interface ImageRequest {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  outPath: string; // .png
  seed?: number;
}
export interface ImageResult {
  path: string;
  mimeType: string;
}
export interface ImageProvider {
  readonly name: string;
  available(): boolean;
  generateImage(req: ImageRequest): Promise<ImageResult>;
}

async function hasFfmpeg(): Promise<boolean> {
  try {
    await pexec("ffmpeg -version");
    return true;
  } catch {
    return false;
  }
}

/** Stub: a solid-color PNG with the prompt drawn on it (ffmpeg), else a manifest. */
export class StubImageProvider implements ImageProvider {
  readonly name = "stub";
  available(): boolean {
    return true;
  }
  async generateImage(req: ImageRequest): Promise<ImageResult> {
    await mkdir(dirname(req.outPath), { recursive: true });
    if (await hasFfmpeg()) {
      const label = req.prompt.replace(/[\\:']/g, " ").slice(0, 60);
      await pexec(
        `ffmpeg -y -f lavfi -i color=c=0x1f2937:s=${req.width}x${req.height} -frames:v 1 ` +
          `-vf "drawtext=text='${label}':fontcolor=white:fontsize=${Math.round(req.width / 30)}:x=(w-text_w)/2:y=(h-text_h)/2" "${req.outPath}"`,
      );
      return { path: req.outPath, mimeType: "image/png" };
    }
    const manifest = req.outPath.replace(/\.png$/, ".image.json");
    await writeFile(manifest, JSON.stringify({ kind: "stub-image", prompt: req.prompt, size: { w: req.width, h: req.height } }, null, 2));
    return { path: manifest, mimeType: "application/json" };
  }
}

/** Local FLUX/SDXL via ComfyUI ($0). Needs a workflow template path (image.workflow). */
export class ComfyUIImageProvider implements ImageProvider {
  readonly name = "comfyui";
  private client = new ComfyUIClient();
  constructor(private cfg: ImageConfig) {}
  available(): boolean {
    return Boolean(this.cfg.workflow);
  }
  async generateImage(req: ImageRequest): Promise<ImageResult> {
    const tpl = resolve(process.cwd(), this.cfg.workflow!);
    await this.client.run(
      tpl,
      { PROMPT: req.prompt, NEGATIVE: req.negativePrompt ?? this.cfg.negative ?? "", WIDTH: req.width, HEIGHT: req.height, SEED: req.seed },
      req.outPath,
      "image",
    );
    return { path: req.outPath, mimeType: "image/png" };
  }
}

/** OpenAI image (gpt-image-1) — cloud option for image-based video. */
export class OpenAIImageProvider implements ImageProvider {
  readonly name = "openai";
  private key = process.env.OPENAI_API_KEY ?? "";
  private base = process.env.FACTORY_OPENAI_BASE ?? "https://api.openai.com/v1";
  constructor(private cfg: ImageConfig) {}
  available(): boolean {
    return this.key.length > 0;
  }
  async generateImage(req: ImageRequest): Promise<ImageResult> {
    // gpt-image-1 supports a fixed set of sizes; pick by orientation.
    const size = req.height > req.width ? "1024x1536" : req.width > req.height ? "1536x1024" : "1024x1024";
    const res = await fetch(`${this.base}/images/generations`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.key}` },
      body: JSON.stringify({ model: this.cfg.model ?? "gpt-image-1", prompt: req.prompt, size, n: 1 }),
    });
    if (!res.ok) throw new Error(`OpenAI image ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { data: Array<{ b64_json?: string; url?: string }> };
    const item = json.data[0];
    await mkdir(dirname(req.outPath), { recursive: true });
    if (item?.b64_json) {
      await writeFile(req.outPath, Buffer.from(item.b64_json, "base64"));
    } else if (item?.url) {
      const img = await fetch(item.url);
      await writeFile(req.outPath, Buffer.from(await img.arrayBuffer()));
    } else {
      throw new Error("OpenAI image: empty response");
    }
    return { path: req.outPath, mimeType: "image/png" };
  }
}

export function getImageProvider(cfg: ImageConfig): { provider: ImageProvider; fellBack: boolean } {
  let provider: ImageProvider;
  switch (cfg.provider) {
    case "comfyui":
      provider = new ComfyUIImageProvider(cfg);
      break;
    case "openai":
      provider = new OpenAIImageProvider(cfg);
      break;
    default:
      provider = new StubImageProvider();
  }
  if (provider.available()) return { provider, fellBack: false };
  return { provider: new StubImageProvider(), fellBack: cfg.provider !== "stub" };
}
