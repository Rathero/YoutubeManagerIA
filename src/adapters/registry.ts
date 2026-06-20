import type { AdapterFactory, NicheAdapter } from "./_interface.js";
import { createLuzAdapter } from "./luz/index.js";
import { createGenerativeAdapter } from "./generative/index.js";
import { createHttpAdapter } from "./http/index.js";

/**
 * Adapter registry: maps ChannelDefinition.data.adapter -> factory.
 *
 * Most channels need NO code: use the declarative adapters
 *  - "generative": content authored by the LLM from the topic (any niche, no data source)
 *  - "http":       a JSON feed mapped declaratively (data niches, no code)
 * Hand-written adapters (like "luz") remain supported as worked examples.
 */
const registry = new Map<string, AdapterFactory>([
  ["luz", createLuzAdapter],
  ["generative", createGenerativeAdapter],
  ["generic", createGenerativeAdapter], // back-compat alias
  ["http", createHttpAdapter],
]);

export function registerAdapter(key: string, factory: AdapterFactory): void {
  registry.set(key, factory);
}

export function getAdapter(key: string): NicheAdapter {
  const factory = registry.get(key);
  if (!factory) {
    throw new Error(
      `No adapter registered for "${key}". Known adapters: ${[...registry.keys()].join(", ") || "(none)"}`,
    );
  }
  return factory();
}

export function hasAdapter(key: string): boolean {
  return registry.has(key);
}

export function listAdapters(): string[] {
  return [...registry.keys()];
}
