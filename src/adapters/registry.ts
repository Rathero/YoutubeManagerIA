import type { AdapterFactory, NicheAdapter } from "./_interface.js";
import { createLuzAdapter } from "./luz/index.js";

/**
 * Adapter registry: maps ChannelDefinition.data.adapter -> factory.
 * Adding a niche means registering one entry here (plus its folder).
 */
const registry = new Map<string, AdapterFactory>([["luz", createLuzAdapter]]);

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
