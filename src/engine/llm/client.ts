/**
 * Minimal swappable LLM client. The engine never imports a vendor SDK directly;
 * it asks for an LlmClient and gets whatever is configured. When no API key is
 * present, callers fall back to deterministic generation so the pipeline still runs.
 */
export interface LlmClient {
  readonly name: string;
  complete(input: { system: string; user: string; maxTokens?: number }): Promise<string>;
}

/**
 * Anthropic client using the Messages API over fetch (no SDK dependency).
 * Uses the latest Claude model family by default.
 */
class AnthropicClient implements LlmClient {
  readonly name = "anthropic";
  constructor(
    private readonly apiKey: string,
    private readonly model = process.env.FACTORY_LLM_MODEL ?? "claude-sonnet-4-6",
  ) {}

  async complete(input: { system: string; user: string; maxTokens?: number }): Promise<string> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: input.maxTokens ?? 1024,
        system: input.system,
        messages: [{ role: "user", content: input.user }],
      }),
    });
    if (!res.ok) {
      throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
    }
    const json = (await res.json()) as { content: Array<{ type: string; text?: string }> };
    return json.content
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("")
      .trim();
  }
}

/** Returns a configured LLM client, or null when none is available. */
export function getLlmClient(): LlmClient | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (key) return new AnthropicClient(key);
  return null;
}
