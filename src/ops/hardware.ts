import os from "node:os";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const pexec = promisify(exec);

export interface Hardware {
  ramGB: number;
  cpus: number;
  platform: string;
  arch: string;
  appleSilicon: boolean;
  gpu: { name: string; vramMB: number } | null;
}

export async function detectHardware(): Promise<Hardware> {
  const ramGB = Math.round(os.totalmem() / 1e9);
  const appleSilicon = process.platform === "darwin" && process.arch === "arm64";
  let gpu: Hardware["gpu"] = null;
  try {
    const { stdout } = await pexec("nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits");
    const line = stdout.trim().split("\n")[0];
    if (line) {
      const [name, mem] = line.split(",").map((s) => s.trim());
      gpu = { name: name!, vramMB: Number(mem) || 0 };
    }
  } catch {
    /* no NVIDIA GPU */
  }
  return { ramGB, cpus: os.cpus().length, platform: process.platform, arch: process.arch, appleSilicon, gpu };
}

export interface Recommendation {
  localLLM: "small" | "medium" | "large" | "cloud-only";
  image: "flux-schnell" | "sdxl" | "cloud-only";
  video: "local-ok" | "cloud-only";
  notes: string[];
}

export function recommend(hw: Hardware): Recommendation {
  const vram = hw.gpu?.vramMB ?? 0;
  // Apple Silicon shares RAM as "VRAM" via Metal (Ollama + ComfyUI run, slower for FLUX).
  const effectiveVram = hw.appleSilicon ? hw.ramGB * 1000 * 0.7 : vram;
  const notes: string[] = [];

  let localLLM: Recommendation["localLLM"] = "cloud-only";
  if (hw.ramGB >= 48 || vram >= 24000) localLLM = "large";
  else if (hw.ramGB >= 16 || vram >= 10000) localLLM = "medium";
  else if (hw.ramGB >= 8) localLLM = "small";

  let image: Recommendation["image"] = "cloud-only";
  if (effectiveVram >= 12000) image = "flux-schnell";
  else if (effectiveVram >= 8000) image = "sdxl";

  const video: Recommendation["video"] = effectiveVram >= 12000 ? "local-ok" : "cloud-only";

  if (!hw.gpu && !hw.appleSilicon) notes.push("Sin GPU NVIDIA: la imagen/vídeo local va muy lenta en CPU → usa la nube o una GPU.");
  if (hw.appleSilicon) notes.push("Apple Silicon: Ollama y ComfyUI corren en Metal; FLUX funciona pero más lento que en NVIDIA.");
  if (localLLM === "cloud-only") notes.push("RAM justa para LLM local: usa modelos cloud (claves en .env) o amplía RAM.");
  notes.push("Siempre puedes usar 100% cloud (cualquier portátil + claves API) o el modo demo $0.");

  return { localLLM, image, video, notes };
}

const LLM_TIER: Record<string, string> = {
  small: "modelos 3-4B (llama3.2, qwen3:4b) — rápido, calidad básica",
  medium: "modelos 8-14B (qwen3:8b/14b) — buen equilibrio",
  large: "modelos 30-70B (qwen3:32b, llama3.3:70b) — máxima calidad local",
  "cloud-only": "usa LLM en la nube (Claude/GPT/Gemini)",
};

export async function runHardware(): Promise<void> {
  const hw = await detectHardware();
  const r = recommend(hw);
  console.log("\nTu equipo:");
  console.log(`  RAM: ${hw.ramGB} GB · CPU: ${hw.cpus} núcleos · ${hw.platform}/${hw.arch}${hw.appleSilicon ? " (Apple Silicon)" : ""}`);
  console.log(`  GPU: ${hw.gpu ? `${hw.gpu.name} (${(hw.gpu.vramMB / 1024).toFixed(0)} GB VRAM)` : hw.appleSilicon ? "Metal (memoria unificada)" : "no NVIDIA"}`);
  console.log("\nQué puedes correr en LOCAL ($0):");
  console.log(`  • Texto (Ollama):  ${LLM_TIER[r.localLLM]}`);
  console.log(`  • Imagen:          ${r.image === "cloud-only" ? "mejor en la nube" : r.image + "  (npm run setup:comfyui)"}`);
  console.log(`  • Vídeo:           ${r.video === "local-ok" ? "Wan/LTX/Hunyuan posible" : "mejor en la nube"}`);
  console.log(`  • Voz (Kokoro):    sí, hasta en CPU`);
  console.log("\nNotas:");
  for (const n of r.notes) console.log(`  - ${n}`);
  console.log("\nDetalle de requisitos por escenario: ver HARDWARE.md\n");
}
