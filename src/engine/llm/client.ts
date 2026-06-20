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
  name?: "anthropic" | "openai" | "gemini" | "auto";
  model?: string;
}

/** Anthropic Claude — Messages API over fetch. */
class AnthropicClient implements LlmClient {
  readonly name = "anthropic";
  constructor(
    private readonly apiKey: string,
    private readonly model = process.env.FACTORY_ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
  ) {}
  async complete(input: { system: string; user: string; maxTokens?: number }): Promise<string> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
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
    const res = await fetch(`${this.base}/chat/completions`, {
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
    const res = await fetch(`${this.base}/models/${this.model}:generateContent`, {
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

function anthropicKey() { return process.env.ANTHROPIC_API_KEY ?? ""; }
function openaiKey() { return process.env.OPENAI_API_KEY ?? ""; }
function geminiKey() { return process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? ""; }

/**
 * Returns a configured LLM client, or null when none is available.
 * Honors an explicit provider; "auto"/unset tries anthropic → openai → gemini.
 */
export function getLlmClient(config?: LlmProviderConfig): LlmClient | null {
  const name = config?.name ?? "auto";
  const model = config?.model;

  if (name === "anthropic") return anthropicKey() ? new AnthropicClient(anthropicKey(), model) : null;
  if (name === "openai") return openaiKey() ? new OpenAIClient(openaiKey(), model) : null;
  if (name === "gemini") return geminiKey() ? new GeminiClient(geminiKey(), model) : null;

  // auto: first available
  if (anthropicKey()) return new AnthropicClient(anthropicKey(), model);
  if (openaiKey()) return new OpenAIClient(openaiKey(), model);
  if (geminiKey()) return new GeminiClient(geminiKey(), model);
  return null;
}
