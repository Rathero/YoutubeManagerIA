import { createInterface } from "node:readline/promises";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { stringify as toYaml } from "yaml";
import { ChannelDefinitionSchema, type ChannelDefinition } from "../core/types/index.js";
import { BUILT_IN_STYLES } from "../engine/visuals/style.js";
import { validateChannel } from "../config/validate.js";
import { recommendStrategy, type StrategyRecommendation } from "./recommend.js";

function slugify(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 32);
}

export interface HttpFeed {
  url: string;
  y_field: string;
  x_field?: string;
  unit?: string;
  label?: string;
  source_name?: string;
}

export interface BuildOptions {
  language?: string;
  region?: string;
  httpFeed?: HttpFeed;
  /** Fully-local, $0 stack: Ollama text + Kokoro voice + ComfyUI images. */
  local?: boolean;
}

/**
 * Turns a strategy recommendation into a runnable (draft) ChannelDefinition — using the
 * declarative adapters ("generative" / "http"), so NO code is ever required.
 */
export function buildDefinitionFromRecommendation(
  topic: string,
  rec: StrategyRecommendation,
  opts: BuildOptions = {},
): ChannelDefinition {
  const language = opts.language ?? "es-ES";
  const region = opts.region ?? "ES";
  const id = `${slugify(rec.brandName || topic)}-${region.toLowerCase()}`;
  const generative = rec.videoMode === "generative";
  // http needs a configured feed; without one, degrade to generative knowledge.
  const useHttp = rec.adapter === "http" && Boolean(opts.httpFeed?.url);
  const adapter = useHttp ? "http" : rec.adapter === "http" ? "generative" : rec.adapter;
  const contentKind = adapter === "generative" && rec.contentKind === "data" ? "knowledge" : rec.contentKind;

  const dataConfig = useHttp
    ? {
        url: opts.httpFeed!.url,
        y_field: opts.httpFeed!.y_field,
        ...(opts.httpFeed!.x_field ? { x_field: opts.httpFeed!.x_field } : {}),
        ...(opts.httpFeed!.unit ? { unit: opts.httpFeed!.unit } : {}),
        ...(opts.httpFeed!.label ? { label: opts.httpFeed!.label } : {}),
        ...(opts.httpFeed!.source_name ? { source_name: opts.httpFeed!.source_name } : {}),
      }
    : {};

  const formats = rec.formats.map((kind) => ({
    kind,
    enabled: true,
    target_seconds: kind === "short" ? 40 : 180,
    structure: kind === "short" ? ["hook", "dato_clave", "cuerpo", "cta"] : ["intro", "desarrollo", "contexto", "consejo", "cta"],
  }));

  const local = Boolean(opts.local);
  const voice = local
    ? { provider: "kokoro" as const, voice_id: "af_sky", model_id: "kokoro", speed: 1.0 }
    : rec.voiceProvider === "elevenlabs"
      ? { provider: "elevenlabs" as const, voice_id: "<tu_voice_id>", model_id: "eleven_v3", speed: 1.0, stability: 0.4, similarity: 0.85 }
      : { provider: rec.voiceProvider, speed: 1.0 };
  const textProviderName = local ? ("local" as const) : rec.textProvider;

  const draft = {
    id,
    status: "draft" as const,
    version: 1,
    identity: {
      name: rec.brandName || topic,
      language,
      region,
      brand: {
        palette: { bg: "#0b1220", fg: "#ffffff", accent: "#3b82f6" },
        fonts: { heading: "Inter", body: "Inter" },
        visual_template: "data-card-v1",
      },
      voice_persona: {
        description: "Cercano, claro, directo. Tutea. Engancha desde la primera frase.",
        do: ["abrir con un gancho", "ser concreto"],
        dont: ["clickbait", "relleno"],
      },
    },
    niche: {
      topic,
      audience: rec.audience,
      value_proposition: rec.valueProp,
      monetization: { primary: rec.monetization.primary, affiliate_verticals: rec.monetization.verticals },
      content_kind: contentKind,
    },
    data: {
      adapter,
      freshness: { type: adapter === "http" ? "daily" : "evergreen", confirm_field: "ready" },
      config: dataConfig,
    },
    formats,
    script: {
      prompt_template: `src/templates/generic/script.md`,
      max_words: { short: 110, long: 420 },
      language_rules: `${language}, frases cortas`,
      provider: { name: textProviderName },
    },
    voice,
    render: {
      engine: generative ? ("generative" as const) : ("ffmpeg" as const),
      template: "data-card-v1",
      aspect_ratios: generative ? ["9:16"] : ["9:16", "16:9"],
      music: { enabled: false },
    },
    ...(generative
      ? {
          // Local default = "images" mode (FLUX/SDXL stills + Ken Burns): cheapest & local-friendly.
          video: {
            mode: local ? ("images" as const) : ("generative" as const),
            provider: local ? ("comfyui" as const) : rec.videoProvider,
            style: rec.style,
            clip_seconds: 8,
            resolution: "1080p" as const,
            use_native_audio: false,
            max_clips: 5,
            llm_storyboard: true,
            ...(local ? { workflow: "comfyui-workflows/wan-video.json" } : {}),
          },
          ...(local
            ? {
                image: {
                  provider: "comfyui" as const,
                  workflow: "comfyui-workflows/sdxl-image.json",
                  negative: "text, watermark, low quality, deformed",
                },
              }
            : {}),
        }
      : {}),
    platforms: [
      { id: "youtube" as const, enabled: true, account_ref: `secrets://youtube/${id}`, posts: rec.formats, publish_times: { short: "21:30" }, mode: "assisted" as const },
      { id: "tiktok" as const, enabled: true, account_ref: `secrets://tiktok/${id}`, posts: ["short" as const], publish_times: { short: "21:35" }, mode: "assisted" as const },
    ],
    schedule: { timezone: "Europe/Madrid", trigger: { type: "pure_cron" as const, at: "20:30" } },
    kpis: { targets: { short_retention_pct: 50 }, review_after_days: 28 },
  };

  return ChannelDefinitionSchema.parse(draft);
}

export interface WizardResult {
  definition: ChannelDefinition;
  path: string;
}

interface WizardOptions {
  topic?: string;
  language?: string;
  region?: string;
  outDir?: string;
  /** Non-interactive: accept every recommendation. */
  yes?: boolean;
  /** Fully-local, $0 stack (Ollama + Kokoro + ComfyUI). */
  local?: boolean;
}

/**
 * Interactive, LLM-guided onboarding. The user describes the topic; the system proposes
 * an approach + the best video MODEL and STYLE, guides the choices, and writes a runnable
 * draft config that flows straight into the generation pipeline. No code required.
 */
export async function runWizard(opts: WizardOptions): Promise<WizardResult> {
  const rl = opts.yes ? null : createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (q: string, def = ""): Promise<string> => {
    if (!rl) return def;
    const a = (await rl.question(def ? `${q} [${def}]: ` : `${q}: `)).trim();
    return a || def;
  };
  const choose = async (q: string, options: string[], def: string): Promise<string> => {
    if (!rl) return def;
    const a = (await rl.question(`${q}\n  opciones: ${options.join(", ")}\n  > [${def}]: `)).trim();
    return options.includes(a) ? a : def;
  };

  try {
    const topic = opts.topic || (await ask("¿Sobre qué tratará el canal? Descríbelo lo mejor posible"));
    if (!topic) throw new Error("Se necesita una temática.");
    const goal = await ask("¿Objetivo o ángulo concreto? (opcional)");

    console.log("\nAnalizando la temática y buscando el mejor enfoque…\n");
    const rec = await recommendStrategy(topic, { language: opts.language, goal });

    console.log("Propuesta del sistema:");
    console.log(`  Tipo de contenido : ${rec.contentKind}`);
    console.log(`  Adapter (sin código): ${rec.adapter}`);
    console.log(`  Modo de vídeo      : ${rec.videoMode}`);
    if (rec.videoMode === "generative") console.log(`  Modelo de vídeo    : ${rec.videoProvider}`);
    console.log(`  Estilo visual      : ${rec.style}  (${rec.styleRationale})`);
    console.log(`  Voz                : ${rec.voiceProvider}`);
    console.log(`  Formatos           : ${rec.formats.join(", ")}`);
    if (rec.dataSourceHint) console.log(`  Fuente sugerida    : ${rec.dataSourceHint}`);
    console.log(`  Razonamiento       : ${rec.rationale}\n`);

    // Guided adjustments (Enter = aceptar la recomendación).
    rec.contentKind = (await choose("Tipo de contenido", ["data", "knowledge", "story"], rec.contentKind)) as any;
    const styleKeys = [rec.style, ...Object.keys(BUILT_IN_STYLES).filter((k) => k !== rec.style), "data_card"];
    rec.style = await choose("Estilo visual", styleKeys, rec.style);
    rec.videoMode = rec.style === "data_card" || rec.contentKind === "data" ? "data_card" : "generative";

    // Cloud (pago, máxima calidad) vs Local ($0, Ollama+Kokoro+ComfyUI).
    const infra = opts.local ? "local" : await choose("Infraestructura de IA", ["cloud", "local"], "cloud");
    const local = infra === "local";

    if (!local) {
      if (rec.videoMode === "generative") {
        rec.videoProvider = (await choose("Modelo de vídeo", ["veo", "sora", "runway"], rec.videoProvider)) as any;
      }
      rec.voiceProvider = (await choose("Proveedor de voz", ["elevenlabs", "openai", "google"], rec.voiceProvider)) as any;
    } else {
      console.log("  → Local: texto=Ollama, voz=Kokoro, imágenes=ComfyUI (FLUX/SDXL). Coste de IA: 0€.");
    }
    const fmt = await choose("Formatos", ["short", "short+long"], rec.formats.length > 1 ? "short+long" : "short");
    rec.formats = fmt === "short+long" ? ["short", "long"] : ["short"];
    rec.adapter = rec.contentKind === "data" ? "http" : "generative";

    // Data niche → optional declarative feed.
    let httpFeed: HttpFeed | undefined;
    if (rec.adapter === "http") {
      const url = await ask("URL del feed JSON con los datos (vacío = usar contenido generado por IA)");
      if (url) {
        httpFeed = {
          url,
          y_field: await ask("Campo numérico a medir (y_field)", "value"),
          x_field: (await ask("Campo del eje X (opcional)")) || undefined,
          unit: (await ask("Unidad (ej. €/kWh)")) || undefined,
          label: (await ask("Qué representa el valor (ej. precio)")) || undefined,
          source_name: (await ask("Nombre de la fuente")) || undefined,
        };
      }
    }

    const region = await ask("Región", opts.region ?? "ES");
    const language = await ask("Idioma", opts.language ?? "es-ES");

    const definition = buildDefinitionFromRecommendation(topic, rec, { language, region, httpFeed, local });
    const dir = resolve(process.cwd(), opts.outDir ?? "src/config");
    await mkdir(dir, { recursive: true });
    const path = resolve(dir, `${definition.id}.yaml`);
    await writeFile(path, toYaml(definition));

    const report = await validateChannel(definition);
    console.log(`\n✅ Canal "${definition.id}" creado (status: draft) — sin escribir una línea de código.`);
    console.log(`   Config: ${path}`);
    for (const w of report.warnings) console.log(`   aviso: ${w}`);
    console.log(`\n   Siguiente: revisa la config, añade claves en .env y prueba:`);
    console.log(`     npm run factory -- run ${definition.id} --dry-run`);
    console.log(`   Cuando te convenza, pon status: active y el scheduler lo recoge.\n`);

    return { definition, path };
  } finally {
    rl?.close();
  }
}
