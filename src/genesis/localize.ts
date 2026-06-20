import { ChannelDefinitionSchema, type ChannelDefinition } from "../core/types/index.js";
import type { LlmClient } from "../engine/llm/client.js";

const LANG: Record<string, { tag: string; region: string; rules: string; name: string }> = {
  en: { tag: "en-US", region: "US", rules: "English, short punchy sentences", name: "English" },
  es: { tag: "es-ES", region: "ES", rules: "español, frases cortas", name: "Spanish" },
  pt: { tag: "pt-BR", region: "BR", rules: "português, frases curtas", name: "Portuguese" },
  fr: { tag: "fr-FR", region: "FR", rules: "français, phrases courtes", name: "French" },
  de: { tag: "de-DE", region: "DE", rules: "Deutsch, kurze Sätze", name: "German" },
  it: { tag: "it-IT", region: "IT", rules: "italiano, frasi brevi", name: "Italian" },
};

function langInfo(code: string) {
  return LANG[code] ?? { tag: code, region: code.toUpperCase().slice(0, 2), rules: `${code}, short sentences`, name: code };
}

interface Strings {
  name: string;
  topic: string;
  audience: string;
  valueProp: string;
  persona: string;
}

async function translate(client: LlmClient, s: Strings, targetName: string): Promise<Strings> {
  const system = `You are a professional localizer. Translate the JSON values to ${targetName}, keeping it natural and idiomatic. Return ONLY the JSON with the same keys.`;
  const out = await client.complete({ system, user: JSON.stringify(s), maxTokens: 700 });
  const j = JSON.parse(out.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim());
  return {
    name: String(j.name ?? s.name),
    topic: String(j.topic ?? s.topic),
    audience: String(j.audience ?? s.audience),
    valueProp: String(j.valueProp ?? s.valueProp),
    persona: String(j.persona ?? s.persona),
  };
}

/**
 * Derive a localized child channel from a base definition. Sets language/region/rules
 * and a `-<lang>` id + account refs. Translates the human strings via the LLM when
 * available; otherwise keeps the originals (so it still produces a valid config).
 */
export async function localizeChannel(
  base: ChannelDefinition,
  langCode: string,
  client: LlmClient | null,
): Promise<ChannelDefinition> {
  const info = langInfo(langCode);
  const clone: ChannelDefinition = JSON.parse(JSON.stringify(base));
  const baseId = base.id.replace(/-[a-z]{2}$/i, "");
  const id = `${baseId}-${langCode}`;

  let strings: Strings = {
    name: base.identity.name,
    topic: base.niche.topic,
    audience: base.niche.audience,
    valueProp: base.niche.value_proposition,
    persona: base.identity.voice_persona.description,
  };
  if (client) {
    try {
      strings = await translate(client, strings, info.name);
    } catch {
      /* keep originals */
    }
  }

  clone.id = id;
  clone.status = "draft";
  clone.identity.name = strings.name;
  clone.identity.language = info.tag;
  clone.identity.region = info.region;
  clone.identity.voice_persona.description = strings.persona;
  clone.niche.topic = strings.topic;
  clone.niche.audience = strings.audience;
  clone.niche.value_proposition = strings.valueProp;
  clone.script.language_rules = info.rules;
  for (const p of clone.platforms) p.account_ref = p.account_ref.replace(base.id, id);

  return ChannelDefinitionSchema.parse(clone);
}
