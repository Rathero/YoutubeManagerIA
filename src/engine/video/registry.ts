import type { VideoProvider } from "./provider.js";
import { VeoVideoProvider } from "./veo.js";
import { SoraVideoProvider } from "./sora.js";
import { RunwayVideoProvider } from "./runway.js";
import { StubVideoProvider } from "./stub.js";

const factories: Record<string, () => VideoProvider> = {
  veo: () => new VeoVideoProvider(),
  sora: () => new SoraVideoProvider(),
  runway: () => new RunwayVideoProvider(),
  stub: () => new StubVideoProvider(),
};

/**
 * Resolve the configured video provider. If it isn't available (no API key), fall
 * back to the stub so the pipeline still runs — and report which one was used.
 */
export function getVideoProvider(name: string): { provider: VideoProvider; fellBack: boolean } {
  const make = factories[name] ?? factories.stub!;
  const provider = make();
  if (provider.available()) return { provider, fellBack: false };
  return { provider: new StubVideoProvider(), fellBack: name !== "stub" };
}
