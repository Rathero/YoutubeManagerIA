import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse as parseYaml, stringify as toYaml } from "yaml";
import { ChannelDefinitionSchema, type ChannelDefinition } from "../core/types/index.js";
import { configDir } from "../storage/paths.js";

/** Parse + validate a ChannelDefinition from a YAML/JSON file. */
export async function loadChannelDefinition(path: string): Promise<ChannelDefinition> {
  const abs = resolve(process.cwd(), path);
  const text = await readFile(abs, "utf8");
  const raw = abs.endsWith(".json") ? JSON.parse(text) : parseYaml(text);
  return ChannelDefinitionSchema.parse(raw);
}

/** Resolve a channel id to its config file (tenant config dir, else src/config). */
export function defaultConfigPath(channelId: string): string {
  return resolve(configDir(), `${channelId}.yaml`);
}

/** Validate and persist a ChannelDefinition to the (tenant) config dir. */
export async function saveChannelDefinition(def: unknown): Promise<ChannelDefinition> {
  const parsed = ChannelDefinitionSchema.parse(def);
  await mkdir(configDir(), { recursive: true });
  await writeFile(defaultConfigPath(parsed.id), toYaml(parsed), "utf8");
  return parsed;
}
