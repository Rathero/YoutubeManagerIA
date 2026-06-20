import type { Stage } from "../../core/pipeline/stage.js";

/** Minimal built-in blocklist (starter; extend per channel via moderation.blocklist). */
const BUILT_IN = [
  // Egregious categories only — channels add domain-specific terms in config.
  "child sexual",
  "make a bomb",
  "build a bomb",
  "kill yourself",
];

export interface ScreenResult {
  flagged: boolean;
  reasons: string[];
}

/** Deterministic keyword screen. Case-insensitive substring match. */
export function screen(text: string, blocklist: string[]): ScreenResult {
  const hay = text.toLowerCase();
  const reasons: string[] = [];
  for (const term of [...BUILT_IN, ...blocklist]) {
    const t = term.trim().toLowerCase();
    if (t && hay.includes(t)) reasons.push(`blocklist match: "${term}"`);
  }
  return { flagged: reasons.length > 0, reasons };
}

const LLM_SYSTEM = `Eres un moderador de contenido. Clasifica el texto. Devuelve SOLO JSON:
{ "flagged": boolean, "reasons": string[] }
Marca flagged=true solo si hay contenido claramente prohibido (odio, violencia explícita,
sexual con menores, instrucciones para daño grave). Contenido informativo/normal => flagged:false.`;

/**
 * Stage — Moderation gate. Screens the script + payload BEFORE the expensive media
 * stages. Deterministic blocklist always runs; an optional LLM pass runs when enabled
 * and a client is available. On a flag it throws → the run aborts and nothing publishes.
 */
export function createModerationStage(): Stage {
  return {
    name: "moderation",
    async run(ctx) {
      if (!ctx.channel.moderation.enabled) {
        ctx.log("info", "moderation disabled; skipping");
        return;
      }
      const text = [
        ctx.payload?.headlineFact,
        ctx.payload?.context,
        ...(ctx.payload?.segments ?? []).map((s) => `${s.title} ${s.detail}`),
        ...(ctx.scripts ?? []).map((s) => s.narration),
      ]
        .filter(Boolean)
        .join("\n");

      let result = screen(text, ctx.channel.moderation.blocklist);

      if (!result.flagged && ctx.channel.moderation.llm && ctx.llm) {
        try {
          const out = await ctx.llm.complete({ system: LLM_SYSTEM, user: text.slice(0, 6000), maxTokens: 300 });
          const j = JSON.parse(out.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim());
          if (j.flagged) result = { flagged: true, reasons: (j.reasons ?? ["LLM moderation"]).map(String) };
        } catch {
          /* moderation LLM unavailable → rely on deterministic screen */
        }
      }

      ctx.moderation = result;
      if (result.flagged) {
        ctx.log("error", "moderation flagged content", { reasons: result.reasons });
        throw new Error(`Moderation blocked publication: ${result.reasons.join("; ")}`);
      }
      ctx.log("info", "moderation passed");
    },
  };
}
