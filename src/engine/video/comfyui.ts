import { resolve } from "node:path";
import type { ChannelDefinition } from "../../core/types/index.js";
import { ComfyUIClient } from "../comfyui/client.js";
import { pixelSize, type VideoClipRequest, type VideoClipResult, type VideoProvider } from "./provider.js";

/**
 * Local text→video via ComfyUI (Wan 2.2 / LTX-Video / HunyuanVideo). $0 inference.
 * Needs a ComfyUI server and a workflow template (video.workflow) exported in API format
 * with {{PROMPT}}/{{WIDTH}}/{{HEIGHT}}/{{SECONDS}}/{{FPS}} tokens. The workflow's final
 * node should output a video (e.g. VHS_VideoCombine) so it lands as a downloadable file.
 */
export class ComfyUIVideoProvider implements VideoProvider {
  readonly name = "comfyui";
  private client = new ComfyUIClient();
  constructor(private workflowPath?: string) {}

  available(): boolean {
    return Boolean(this.workflowPath);
  }

  async generateClip(req: VideoClipRequest): Promise<VideoClipResult> {
    const { w, h } = pixelSize(req.aspectRatio, req.resolution === "4k" ? "1080p" : req.resolution);
    const tpl = resolve(process.cwd(), this.workflowPath!);
    await this.client.run(
      tpl,
      { PROMPT: req.prompt, NEGATIVE: req.negativePrompt ?? "", WIDTH: w, HEIGHT: h, SECONDS: req.seconds, FPS: 24 },
      req.outPath,
      "video",
    );
    return { path: req.outPath, mimeType: "video/mp4", durationSec: req.seconds, hasAudio: false };
  }
}

export function comfyuiVideoFromChannel(channel: ChannelDefinition): ComfyUIVideoProvider {
  return new ComfyUIVideoProvider(channel.video?.workflow);
}
