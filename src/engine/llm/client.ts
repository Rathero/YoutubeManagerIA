import { resilientFetch } from "../../core/util/fetch.js";

/**
 * Swappable text/LLM clients. The engine never imports a vendor SDK directly; it asks
 * for an LlmClient and gets whatever the channel configured (anthropic | openai | gemini),
 * falling back across available keys, then to deterministic generation when none exist.
 */
export interface LlmClient {
  readonly name: string;
  complete(input: { system: string; user: string; maxTokens?: number }): Promise<string>;
}

export interface LlmProviderConfig {
  name?: "anthropic" | "openai" | "gemini" | "local" | "ollama" | "auto";
  model?: string;
  base?: string;
}

/** Anthropic Claude — Messages API over fetch. */
class AnthropicClient implements LlmClient {
  readonly name = "anthropic";
  constructor(
    private readonly apiKey: string,
    private readonly model = process.env.FACTORY_ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
  ) {}
  async complete(input: { system: string; user: string; maxTokens?: number }): Promise<string> {
    const res = await resilientFetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": this.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: this.model,
        max_tokens: input.maxTokens ?? 1024,
        system: input.system,
        messages: [{ role: "user", content: input.user }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { content: Array<{ type: string; text?: string }> };
    return json.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim();
  }
}

/** OpenAI GPT — Chat Completions API. */
class OpenAIClient implements LlmClient {
  readonly name = "openai";
  constructor(
    private readonly apiKey: string,
    private readonly model = process.env.FACTORY_OPENAI_MODEL ?? "gpt-4o",
    private readonly base = process.env.FACTORY_OPENAI_BASE ?? "https://api.openai.com/v1",
  ) {}
  async complete(input: { system: string; user: string; maxTokens?: number }): Promise<string> {
    const res = await resilientFetch(`${this.base}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        max_tokens: input.maxTokens ?? 1024,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    return (json.choices[0]?.message.content ?? "").trim();
  }
}

/** Google Gemini — generateContent API. */
class GeminiClient implements LlmClient {
  readonly name = "gemini";
  constructor(
    private readonly apiKey: string,
    private readonly model = process.env.FACTORY_GEMINI_MODEL ?? "gemini-2.5-flash",
    private readonly base = process.env.FACTORY_GEMINI_BASE ?? "https://generativelanguage.googleapis.com/v1beta",
  ) {}
  async complete(input: { system: string; user: string; maxTokens?: number }): Promise<string> {
    const res = await resilientFetch(`${this.base}/models/${this.model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: input.system }] },
        contents: [{ role: "user", parts: [{ text: input.user }] }],
        generationConfig: { maxOutputTokens: input.maxTokens ?? 1024 },
      }),
    });
    if (!res.ok) throw new Error(`Gemini API ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    return (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  }
}

/**
 * Local LLM — any OpenAI-compatible server (Ollama, LM Studio, llama.cpp, vLLM).
 * Zero API cost. No key required; reachability is checked at call time (callers fall
 * back to deterministic generation on error). Default points at Ollama.
 */
class LocalLlmClient implements LlmClient {
  readonly name = "local";
  constructor(
    private readonly model = process.env.FACTORY_LOCAL_LLM_MODEL ?? "qwen3",
    private readonly base = process.env.FACTORY_LOCAL_LLM_URL ?? "http://localhost:11434/v1",
  ) {}
  async complete(input: { system: string; user: string; maxTokens?: number }): Promise<string> {
    const res = await resilientFetch(`${this.base}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer local" },
      body: JSON.stringify({
        model: this.model,
        max_tokens: input.maxTokens ?? 1024,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Local LLM ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    return (json.choices[0]?.message.content ?? "").trim();
  }
}

function anthropicKey() { return process.env.ANTHROPIC_API_KEY ?? ""; }
function openaiKey() { return process.env.OPENAI_API_KEY ?? ""; }
function geminiKey() { return process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? ""; }
/** Local is "enabled" for auto-selection when a local URL/flag is set. */
function localEnabled() { return Boolean(process.env.FACTORY_LOCAL_LLM_URL || process.env.FACTORY_LOCAL_LLM === "1"); }

/**
 * Returns a configured LLM client, or null when none is available. Honors an explicit
 * provider ("local"/"ollama" = self-hosted, $0); "auto" tries anthropic → openai →
 * gemini → local (if FACTORY_LOCAL_LLM[_URL] is set).
 */
export function getLlmClient(config?: LlmProviderConfig): LlmClient | null {
  const name = config?.name ?? "auto";
  const model = config?.model;

  if (name === "local" || name === "ollama") return new LocalLlmClient(model, config?.base);
  if (name === "anthropic") return anthropicKey() ? new AnthropicClient(anthropicKey(), model) : null;
  if (name === "openai") return openaiKey() ? new OpenAIClient(openaiKey(), model) : null;
  if (name === "gemini") return geminiKey() ? new GeminiClient(geminiKey(), model) : null;

  // auto: first available (cloud keys first, then local if enabled)
  if (anthropicKey()) return new AnthropicClient(anthropicKey(), model);
  if (openaiKey()) return new OpenAIClient(openaiKey(), model);
  if (geminiKey()) return new GeminiClient(geminiKey(), model);
  if (localEnabled()) return new LocalLlmClient(model, config?.base);
  return null;
}

/**
 * Async, reachability-aware resolver. For "auto" it is LOCAL-FIRST to save money:
 * if a local LLM server is up it uses it, regardless of cloud keys (override with
 * FACTORY_PREFER_CLOUD=1). Falls back to cloud keys, then local-if-enabled, then null.
 * Explicit providers behave exactly like getLlmClient().
 */
export async function resolveLlmClient(config?: LlmProviderConfig): Promise<LlmClient | null> {
  const name = config?.name ?? "auto";
  if (name !== "auto") return getLlmClient(config);

  const preferCloud = process.env.FACTORY_PREFER_CLOUD === "1";
  if (!preferCloud) {
    const { isLocalLlmReachable } = await import("../../ops/doctor.js");
    if (await isLocalLlmReachable()) return new LocalLlmClient(config?.model, config?.base);
  }
  return getLlmClient(config);
}
