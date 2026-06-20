import { describe, expect, it } from "vitest";
import { getLlmClient, resolveLlmClient } from "./llm/client.js";
import { getImageProvider } from "./image/provider.js";
import { getTtsProvider } from "./voice/provider.js";
import { getVideoProvider } from "./video/registry.js";
import type { VoiceConfig } from "../core/types/index.js";

describe("local provider selection ($0 stack)", () => {
  it("selects a local LLM client by name without any API key", () => {
    const c = getLlmClient({ name: "local" });
    expect(c).not.toBeNull();
    expect(c!.name).toBe("local");
  });

  it("selects a local LLM client for ollama", () => {
    expect(getLlmClient({ name: "ollama" })?.name).toBe("local");
  });

  it("image: comfyui without a workflow falls back to stub", () => {
    const { provider, fellBack } = getImageProvider({ provider: "comfyui" } as any);
    expect(provider.name).toBe("stub");
    expect(fellBack).toBe(true);
  });

  it("image: comfyui with a workflow is selected (available)", () => {
    const { provider, fellBack } = getImageProvider({ provider: "comfyui", workflow: "comfyui-workflows/sdxl-image.json" } as any);
    expect(provider.name).toBe("comfyui");
    expect(fellBack).toBe(false);
  });

  it("voice: kokoro/local provider is selected (reachability checked at call time)", () => {
    const cfg = { provider: "kokoro", speed: 1, voice_id: "af_sky" } as VoiceConfig;
    expect(getTtsProvider(cfg).provider.name).toBe("local");
  });

  it("voice: piper without model_path falls back to stub", () => {
    const cfg = { provider: "piper", speed: 1 } as VoiceConfig;
    const { provider, fellBack } = getTtsProvider(cfg);
    expect(provider.name).toBe("stub");
    expect(fellBack).toBe(true);
  });

  it("video: comfyui with a workflow is selected", () => {
    const { provider, fellBack } = getVideoProvider("comfyui", { workflow: "comfyui-workflows/wan-video.json" });
    expect(provider.name).toBe("comfyui");
    expect(fellBack).toBe(false);
  });

  it("resolveLlmClient honors an explicit local provider without probing", async () => {
    const c = await resolveLlmClient({ name: "local" });
    expect(c?.name).toBe("local");
  });

  it("resolveLlmClient auto returns null when no local server and no cloud key", async () => {
    process.env.ANTHROPIC_API_KEY = "";
    process.env.OPENAI_API_KEY = "";
    process.env.GEMINI_API_KEY = "";
    process.env.GOOGLE_API_KEY = "";
    // No local configured (default URL points at a port with nothing listening).
    delete process.env.FACTORY_LOCAL_LLM_URL;
    delete process.env.FACTORY_LOCAL_LLM;
    const c = await resolveLlmClient({ name: "auto" });
    expect(c).toBeNull();
  });
});
