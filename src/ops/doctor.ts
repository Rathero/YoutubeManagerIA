import { exec } from "node:child_process";
import { promisify } from "node:util";

const pexec = promisify(exec);

export interface ServiceStatus {
  name: string;
  url?: string;
  ok: boolean;
  detail: string;
}

export interface LocalReport {
  llm: ServiceStatus;
  /** Configured local model + whether it's actually downloaded/loaded. */
  llmModel: { name: string; present: boolean; available: string[] };
  tts: ServiceStatus;
  comfyui: ServiceStatus;
  ffmpeg: ServiceStatus;
  cloud: ServiceStatus[];
}

export function localLlmModel(): string {
  return process.env.FACTORY_LOCAL_LLM_MODEL ?? "qwen3";
}

/** List model ids from an OpenAI-compatible /models endpoint (Ollama, etc.). */
async function listLocalModels(timeoutMs = 1500): Promise<string[]> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`${localLlmUrl()}/models`, { signal: ac.signal });
    if (!res.ok) return [];
    const j = (await res.json()) as { data?: any[]; models?: any[] };
    const arr = j.data ?? j.models ?? [];
    return arr.map((m: any) => m.id ?? m.name ?? m.model).filter(Boolean);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** True when `want` matches an available model id (ignoring the :tag). */
export function modelPresent(want: string, available: string[]): boolean {
  const base = (s: string) => s.split(":")[0];
  return available.some((id) => id === want || base(id) === base(want));
}

export function localLlmUrl(): string {
  return process.env.FACTORY_LOCAL_LLM_URL ?? "http://localhost:11434/v1";
}
export function localTtsUrl(): string {
  return process.env.FACTORY_LOCAL_TTS_URL ?? "http://localhost:8880/v1";
}
export function comfyuiUrl(): string {
  return process.env.FACTORY_COMFYUI_URL ?? "http://localhost:8188";
}

/** GET a URL with a short timeout; true on any 2xx/4xx (server is up). */
async function probeHttp(url: string, timeoutMs = 1200): Promise<boolean> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal });
    return res.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function commandExists(cmd: string): Promise<boolean> {
  try {
    await pexec(`${cmd} -version`);
    return true;
  } catch {
    return false;
  }
}

// Cache the LLM reachability for the process so auto-selection doesn't re-probe.
let llmReachableCache: boolean | undefined;
export async function isLocalLlmReachable(): Promise<boolean> {
  if (llmReachableCache !== undefined) return llmReachableCache;
  llmReachableCache = await probeHttp(`${localLlmUrl()}/models`);
  return llmReachableCache;
}

export async function probeLocalServices(): Promise<LocalReport> {
  const [llmUp, ttsUp, comfyUp, ffmpegOk] = await Promise.all([
    probeHttp(`${localLlmUrl()}/models`),
    probeHttp(`${localTtsUrl()}/models`),
    probeHttp(`${comfyuiUrl()}/system_stats`),
    commandExists("ffmpeg"),
  ]);
  llmReachableCache = llmUp;

  const wantModel = localLlmModel();
  const available = llmUp ? await listLocalModels() : [];
  const present = modelPresent(wantModel, available);

  const cloudKey = (name: string, env: string[]): ServiceStatus => ({
    name,
    ok: env.some((e) => Boolean(process.env[e])),
    detail: env.some((e) => Boolean(process.env[e])) ? "key set" : `set one of ${env.join("/")}`,
  });

  return {
    llm: { name: "LLM local (Ollama/OpenAI-compat)", url: localLlmUrl(), ok: llmUp, detail: llmUp ? "online" : "offline → fallback determinista" },
    llmModel: { name: wantModel, present, available },
    tts: { name: "TTS local (Kokoro/LocalAI)", url: localTtsUrl(), ok: ttsUp, detail: ttsUp ? "online" : "offline → stub voz" },
    comfyui: { name: "ComfyUI (imagen/vídeo)", url: comfyuiUrl(), ok: comfyUp, detail: comfyUp ? "online" : "offline → stub" },
    ffmpeg: { name: "ffmpeg", ok: ffmpegOk, detail: ffmpegOk ? "instalado" : "ausente → render como manifest" },
    cloud: [
      cloudKey("Anthropic", ["ANTHROPIC_API_KEY"]),
      cloudKey("OpenAI", ["OPENAI_API_KEY"]),
      cloudKey("Gemini/Google", ["GEMINI_API_KEY", "GOOGLE_API_KEY"]),
      cloudKey("ElevenLabs", ["ELEVENLABS_API_KEY"]),
      cloudKey("Runway", ["RUNWAY_API_KEY", "RUNWAYML_API_SECRET"]),
      cloudKey("YouTube upload", ["FACTORY_YT_ACCESS_TOKEN"]),
    ],
  };
}

function mark(ok: boolean): string {
  return ok ? "✅" : "❌";
}

export async function runDoctor(): Promise<void> {
  const r = await probeLocalServices();
  console.log("\nChannel Factory — diagnóstico\n");
  console.log("Modelos LOCALES ($0):");
  console.log(`  ${mark(r.llm.ok)} ${r.llm.name.padEnd(34)} ${r.llm.url ?? ""}  — ${r.llm.detail}`);
  if (r.llm.ok) {
    const m = r.llmModel;
    const detail = m.present
      ? `descargado (${m.available.length} modelo/s disponibles)`
      : `NO descargado → ejecuta:  ollama pull ${m.name}`;
    console.log(`  ${mark(m.present)} modelo "${m.name}"${" ".repeat(Math.max(1, 24 - m.name.length))}${detail}`);
  }
  for (const s of [r.tts, r.comfyui]) {
    console.log(`  ${mark(s.ok)} ${s.name.padEnd(34)} ${s.url ?? ""}  — ${s.detail}`);
  }
  console.log(`  ${mark(r.ffmpeg.ok)} ${r.ffmpeg.name.padEnd(34)} ${"".padEnd(0)}  — ${r.ffmpeg.detail}`);
  console.log("\nClaves CLOUD (de pago):");
  for (const s of r.cloud) console.log(`  ${mark(s.ok)} ${s.name.padEnd(18)} — ${s.detail}`);

  const anyLocal = r.llm.ok || r.tts.ok || r.comfyui.ok;
  const anyCloud = r.cloud.some((c) => c.ok);
  console.log("");
  if (!anyLocal && !anyCloud) {
    console.log("Sin proveedores activos: el pipeline corre en modo stub (todo offline).");
    console.log("→ Para un stack local gratis:  npm run setup:local");
  } else {
    if (r.llm.ok && !r.llmModel.present) {
      console.log(`⚠ El servidor LLM está activo pero falta el modelo "${r.llmModel.name}".`);
      console.log(`→ Descárgalo:  ollama pull ${r.llmModel.name}`);
    } else if (r.llm.ok) {
      console.log("Texto: usará el LLM local automáticamente (auto local-first).");
    } else if (anyCloud) {
      console.log("Texto: usará un proveedor cloud (hay clave).");
    }
    console.log("Listo para generar. Crea un canal local con:  npm run factory -- create --topic \"...\" --local");
  }
  console.log("");
}
