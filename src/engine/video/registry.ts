import type { VideoProvider } from "./provider.js";
import { VeoVideoProvider } from "./veo.js";
import { SoraVideoProvider } from "./sora.js";
import { RunwayVideoProvider } from "./runway.js";
import { ComfyUIVideoProvider } from "./comfyui.js";
import { StubVideoProvider } from "./stub.js";

export interface VideoProviderOptions {
  /** ComfyUI workflow template path (for provider: comfyui). */
  workflow?: string;
}

function make(name: string, opts: VideoProviderOptions): VideoProvider {
  switch (name) {
    case "veo":
      return new VeoVideoProvider();
    case "sora":
      return new SoraVideoProvider();
    case "runway":
      return new RunwayVideoProvider();
    case "comfyui":
      return new ComfyUIVideoProvider(opts.workflow);
    default:
      return new StubVideoProvider();
  }
}

/**
 * Resolve the configured video provider. If it isn't available (no API key / no local
 * workflow), fall back to the stub so the pipeline still runs — and report which.
 */
export function getVideoProvider(name: string, opts: VideoProviderOptions = {}): { provider: VideoProvider; fellBack: boolean } {
  const provider = make(name, opts);
  if (provider.available()) return { provider, fellBack: false };
  return { provider: new StubVideoProvider(), fellBack: name !== "stub" };
}
