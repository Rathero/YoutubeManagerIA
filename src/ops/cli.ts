#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { stringify as toYaml } from "yaml";
import { Command } from "commander";
import { loadChannelDefinition, defaultConfigPath } from "../config/loader.js";
import { validateChannel } from "../config/validate.js";
import { runChannel } from "../engine/run.js";
import { runGenesis } from "../genesis/index.js";
import { listAdapters } from "../adapters/registry.js";
import { BUILT_IN_STYLES } from "../engine/visuals/style.js";
import { deriveFeedback, type PublicationMetric } from "../analytics/index.js";
import { dbDir } from "../storage/paths.js";

const program = new Command();
program.name("factory").description("Channel Factory — agnostic faceless channel automation").version("0.1.0");

function resolveConfig(channelOrPath: string): string {
  if (channelOrPath.endsWith(".yaml") || channelOrPath.endsWith(".yml") || channelOrPath.endsWith(".json")) {
    return resolve(process.cwd(), channelOrPath);
  }
  return defaultConfigPath(channelOrPath);
}

program
  .command("validate")
  .description("Validate a channel definition (the gate before going active)")
  .argument("<channel>", "channel id or path to its definition file")
  .action(async (channel: string) => {
    const def = await loadChannelDefinition(resolveConfig(channel));
    const report = await validateChannel(def);
    console.log(`\nValidation: ${def.id} — ${report.ok ? "OK ✅" : "FAILED ❌"}`);
    for (const e of report.errors) console.log(`  error:   ${e}`);
    for (const w of report.warnings) console.log(`  warning: ${w}`);
    if (!report.ok) process.exitCode = 1;
  });

program
  .command("run")
  .description("Run one production cycle for a channel")
  .argument("<channel>", "channel id or path to its definition file")
  .option("-d, --date <iso>", "target date (YYYY-MM-DD), defaults to today")
  .option("--dry-run", "do everything except actually publishing", false)
  .action(async (channel: string, opts: { date?: string; dryRun?: boolean }) => {
    const def = await loadChannelDefinition(resolveConfig(channel));
    const outcome = await runChannel(def, { date: opts.date, dryRun: opts.dryRun });
    console.log(`\nRun ${outcome.ctx.runId} — ${outcome.status.toUpperCase()}`);
    if (outcome.status === "skipped") console.log(`  reason: ${outcome.reason}`);
    if (outcome.status === "failed") console.log(`  failed at ${outcome.stage}: ${outcome.error.message}`);
    for (const p of outcome.ctx.publications ?? []) {
      const where = p.url ?? p.queuedItemPath ?? "";
      console.log(`  ${p.platform}/${p.format}: ${p.status} ${where} ${p.message ? "— " + p.message : ""}`);
    }
    if (outcome.status === "failed") process.exitCode = 1;
  });

program
  .command("create")
  .description("Guided, no-code onboarding: describe a topic → system guides model+style → runnable config")
  .option("-t, --topic <topic>", "the niche idea (otherwise you'll be asked)")
  .option("-l, --language <lang>", "language tag", "es-ES")
  .option("-r, --region <region>", "region code", "ES")
  .option("-o, --out <dir>", "output directory for the config", "src/config")
  .option("-y, --yes", "non-interactive: accept all recommendations", false)
  .option("--local", "fully-local $0 stack: Ollama + Kokoro + ComfyUI", false)
  .action(async (opts: { topic?: string; language: string; region: string; out: string; yes?: boolean; local?: boolean }) => {
    const { runWizard } = await import("../genesis/wizard.js");
    await runWizard({ topic: opts.topic, language: opts.language, region: opts.region, outDir: opts.out, yes: opts.yes, local: opts.local });
  });

program
  .command("genesis")
  .description("Phase A: turn a topic into a draft ChannelDefinition + strategy report")
  .requiredOption("-t, --topic <topic>", "the niche idea")
  .option("-l, --language <lang>", "language tag", "es-ES")
  .option("-r, --region <region>", "region code", "ES")
  .option("-o, --out <dir>", "output directory", "out/genesis")
  .option("--text-provider <p>", "anthropic | openai | gemini | auto", "auto")
  .option("--voice-provider <p>", "elevenlabs | openai | google | stub", "stub")
  .option("--video <mode>", "data_card | generative", "data_card")
  .option("--video-provider <p>", "veo | sora | runway | stub", "veo")
  .option("--style <style>", "visual style for generative video", "realistic")
  .action(async (opts: {
    topic: string; language: string; region: string; out: string;
    textProvider: any; voiceProvider: any; video: any; videoProvider: any; style: string;
  }) => {
    const result = await runGenesis({
      topic: opts.topic,
      language: opts.language,
      region: opts.region,
      prefs: {
        textProvider: opts.textProvider,
        voiceProvider: opts.voiceProvider,
        videoMode: opts.video,
        videoProvider: opts.videoProvider,
        style: opts.style,
      },
    });
    const dir = resolve(process.cwd(), opts.out);
    await mkdir(dir, { recursive: true });
    const id = result.definition.id;
    await writeFile(resolve(dir, `${id}.yaml`), toYaml(result.definition));
    await writeFile(resolve(dir, `${id}.report.md`), result.report);
    if (result.adapterSpec) await writeFile(resolve(dir, `${id}.adapter-spec.md`), result.adapterSpec);
    console.log(`\nGenesis complete for "${opts.topic}"`);
    console.log(`  recommendation: ${result.viability.recommendation.toUpperCase()} (score ${result.viability.total})`);
    console.log(`  draft config:   ${resolve(dir, `${id}.yaml`)}`);
    console.log(`  report:         ${resolve(dir, `${id}.report.md`)}`);
    if (result.adapterSpec) console.log(`  adapter spec:   ${resolve(dir, `${id}.adapter-spec.md`)}`);
    console.log(`\n  → Human gate: review, adjust, then set status: active.`);
  });

program
  .command("adapters")
  .description("List registered niche adapters")
  .action(() => {
    console.log("Registered adapters: " + (listAdapters().join(", ") || "(none)"));
  });

program
  .command("doctor")
  .description("Check which local servers (LLM/TTS/ComfyUI) and cloud keys are available")
  .action(async () => {
    const { runDoctor } = await import("./doctor.js");
    await runDoctor();
  });

program
  .command("providers")
  .description("List available AI providers per category (text / voice / video)")
  .action(() => {
    console.log("CLOUD (de pago):");
    console.log("  Text (LLM):   anthropic, openai, gemini  (auto = first with a key)");
    console.log("  Voice (TTS):  elevenlabs, openai, google");
    console.log("  Image:        openai (gpt-image-1)");
    console.log("  Video (gen):  veo, sora, runway");
    console.log("\nLOCAL ($0, self-hosted):");
    console.log("  Text (LLM):   local | ollama   → OpenAI-compatible (Ollama/LM Studio/vLLM)");
    console.log("  Voice (TTS):  kokoro | local   → Kokoro/Speaches/LocalAI (OpenAI-compatible)");
    console.log("                piper            → Piper binary");
    console.log("  Image:        comfyui          → FLUX / SDXL");
    console.log("  Video (gen):  comfyui          → Wan 2.2 / LTX-Video / HunyuanVideo");
    console.log("\nLocal URLs (env): FACTORY_LOCAL_LLM_URL (11434), FACTORY_LOCAL_TTS_URL (8880),");
    console.log("FACTORY_COMFYUI_URL (8188). Sin clave/servidor → fallback a stub. `create --local` lo configura.");
  });

program
  .command("styles")
  .description("List built-in visual styles for generative video")
  .action(() => {
    for (const [key, s] of Object.entries(BUILT_IN_STYLES)) {
      console.log(`  ${key.padEnd(12)} ${s.photoreal ? "[photoreal]" : "          "}  ${s.descriptor.slice(0, 70)}…`);
    }
    console.log("\nSet video.style to one of these, or define your own in video.custom_styles.");
  });

program
  .command("feedback")
  .description("M6: derive scheduling/hook recommendations from collected metrics")
  .argument("<channel>", "channel id")
  .option("-m, --metrics <file>", "metrics JSON file (defaults to out/_db/metrics/<id>.json)")
  .action(async (channel: string, opts: { metrics?: string }) => {
    const path = opts.metrics ? resolve(process.cwd(), opts.metrics) : join(dbDir(), "metrics", `${channel}.json`);
    let metrics: PublicationMetric[];
    try {
      metrics = JSON.parse(await readFile(path, "utf8"));
    } catch {
      console.log(`No metrics found at ${path}. Use 'factory metrics:sample ${channel}' to generate demo data.`);
      return;
    }
    const signals = deriveFeedback(metrics);
    if (signals.length === 0) {
      console.log(`Not enough signal yet (${metrics.length} data points). Keep publishing.`);
      return;
    }
    console.log(`\nFeedback for ${channel} (${metrics.length} publications):`);
    for (const s of signals) console.log(`  [${s.variable}] (conf ${s.confidence}) ${s.recommendation}`);
  });

program
  .command("metrics:sample")
  .description("Generate synthetic metrics to demo the feedback loop")
  .argument("<channel>", "channel id")
  .action(async (channel: string) => {
    const hours = [18, 21, 21, 21, 9, 14];
    const classes = ["barato", "caro", "barato", "normal", "barato", "caro"];
    const metrics: PublicationMetric[] = [];
    for (let i = 0; i < 18; i++) {
      const hour = hours[i % hours.length]!;
      const cls = classes[i % classes.length]!;
      const base = hour === 21 ? 4200 : hour === 18 ? 2600 : 1500;
      const clsBoost = cls === "barato" ? 1.3 : cls === "caro" ? 0.85 : 1;
      metrics.push({
        channelId: channel,
        date: `2026-06-${String((i % 28) + 1).padStart(2, "0")}`,
        platform: "youtube",
        format: i % 3 === 0 ? "long" : "short",
        publishHour: hour,
        classification: cls,
        views: Math.round(base * clsBoost * (0.9 + (i % 5) * 0.05)),
        retentionPct: i % 3 === 0 ? 38 + (i % 4) : 52 + (i % 6),
      });
    }
    const dir = join(dbDir(), "metrics");
    await mkdir(dir, { recursive: true });
    const path = join(dir, `${channel}.json`);
    await writeFile(path, JSON.stringify(metrics, null, 2));
    console.log(`Wrote ${metrics.length} synthetic metrics to ${path}`);
  });

program
  .command("worker")
  .description("Start the BullMQ worker that schedules + runs active channels (needs Redis)")
  .argument("<channels...>", "channel ids or definition file paths")
  .action(async (channels: string[]) => {
    const defs = await Promise.all(channels.map((c) => loadChannelDefinition(resolveConfig(c))));
    const { startWorker } = await import("../scheduling/worker.js");
    const handle = await startWorker(defs);
    console.log(`Worker running for ${defs.length} channel(s). Ctrl+C to stop.`);
    const stop = async () => {
      await handle.stop();
      process.exit(0);
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
