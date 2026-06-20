import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { ChannelDefinitionSchema, type ChannelDefinition } from "../core/types/index.js";

/** Parse + validate a ChannelDefinition from a YAML/JSON file. */
export async function loadChannelDefinition(path: string): Promise<ChannelDefinition> {
  const abs = resolve(process.cwd(), path);
  const text = await readFile(abs, "utf8");
  const raw = abs.endsWith(".json") ? JSON.parse(text) : parseYaml(text);
  return ChannelDefinitionSchema.parse(raw);
}

export function defaultConfigPath(channelId: string): string {
  return resolve(process.cwd(), "src/config", `${channelId}.yaml`);
}
