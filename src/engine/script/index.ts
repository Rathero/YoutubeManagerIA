import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Stage } from "../../core/pipeline/stage.js";
import type { ContentPayload, Format, FormatScript } from "../../core/types/index.js";
import type { LlmClient } from "../llm/client.js";
import { deterministicScript } from "./deterministic.js";

function buildSystemPrompt(templateBody: string, persona: { description: string; do: string[]; dont: string[] }, languageRules?: string): string {
  return [
    templateBody.trim(),
    "",
    "## Persona de voz",
    persona.description,
    persona.do.length ? `Haz: ${persona.do.join("; ")}.` : "",
    persona.dont.length ? `Evita: ${persona.dont.join("; ")}.` : "",
    languageRules ? `\n## Reglas de idioma\n${languageRules}` : "",
    "",
    "## Reglas DURAS (no negociables)",
    "- Usa SOLO las cifras presentes en el JSON. No inventes ni estimes datos nuevos.",
    "- Respeta el límite de palabras indicado.",
    "- Devuelve EXCLUSIVAMENTE un objeto JSON con una clave por sección solicitada; cada valor es el texto de esa sección. Sin markdown, sin explicaciones.",
  ]
    .filter(Boolean)
    .join("\n");
}

async function llmScript(
  client: LlmClient,
  templateBody: string,
  payload: ContentPayload,
  format: Format,
  persona: { description: string; do: string[]; dont: string[] },
  languageRules: string | undefined,
  maxWords: number | undefined,
): Promise<FormatScript> {
  const structure = format.structure.length > 0 ? format.structure : ["hook", "body", "cta"];
  const system = buildSystemPrompt(templateBody, persona, languageRules);
  const user = [
    `Formato: ${format.kind} (~${format.target_seconds ?? "n/a"}s).`,
    maxWords ? `Máximo de palabras TOTAL: ${maxWords}.` : "",
    `Secciones requeridas (claves del JSON de salida, en este orden): ${structure.join(", ")}.`,
    "",
    "ContentPayload (única fuente de datos permitida):",
    JSON.stringify(payload, null, 2),
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await client.complete({ system, user, maxTokens: 1500 });
  const jsonText = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const parsed = JSON.parse(jsonText) as Record<string, string>;

  const sections: Record<string, string> = {};
  for (const key of structure) sections[key] = String(parsed[key] ?? "").trim();
  const narration = structure.map((k) => sections[k]).filter(Boolean).join(" ");
  return {
    format: format.kind,
    sections,
    narration,
    wordCount: narration.split(/\s+/).filter(Boolean).length,
  };
}

/**
 * Stage 3 — Script. One script per enabled format. The LLM redacta, no inventa:
 * data comes only from the ContentPayload. Falls back to deterministic generation
 * when there is no LLM client or the LLM output can't be parsed.
 */
export function createScriptStage(client: LlmClient | null): Stage {
  return {
    name: "script",
    async run(ctx) {
      const payload = ctx.payload;
      if (!payload) throw new Error("script: no payload (compute did not run)");

      const persona = ctx.channel.identity.voice_persona;
      const languageRules = ctx.channel.script.language_rules;
      const maxWordsMap = ctx.channel.script.max_words ?? {};

      let templateBody = "";
      if (client) {
        try {
          templateBody = await readFile(resolve(process.cwd(), ctx.channel.script.prompt_template), "utf8");
        } catch {
          ctx.log("warn", "prompt template not found; using deterministic script", {
            template: ctx.channel.script.prompt_template,
          });
        }
      }

      const enabled = ctx.channel.formats.filter((f) => f.enabled);
      const scripts: FormatScript[] = [];
      for (const format of enabled) {
        const maxWords = maxWordsMap[format.kind];
        if (client && templateBody) {
          try {
            scripts.push(await llmScript(client, templateBody, payload, format, persona, languageRules, maxWords));
            ctx.log("info", `llm script for ${format.kind}`);
            continue;
          } catch (err) {
            ctx.log("warn", `llm script failed for ${format.kind}, falling back`, {
              error: (err as Error).message,
            });
          }
        }
        scripts.push(deterministicScript(payload, format, maxWords));
      }
      ctx.scripts = scripts;
    },
  };
}
