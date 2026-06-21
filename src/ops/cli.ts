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
  .command("runs")
  .description("List recent runs for a channel (status, stages, publications)")
  .argument("<channel>", "channel id")
  .option("-n, --limit <n>", "max runs to show", "15")
  .action(async (channel: string, opts: { limit: string }) => {
    const { getStore } = await import("../storage/index.js");
    const store = await getStore();
    const runs = await store.listRuns(channel, Number(opts.limit));
    if (runs.length === 0) {
      console.log(`No runs recorded for ${channel}.`);
      return;
    }
    console.log(`\nÚltimas ejecuciones de ${channel}:`);
    for (const r of runs) {
      const pub = r.publications.filter((p) => p.status === "published" || p.status === "queued_assisted").length;
      const failed = r.stages.find((s) => s.status === "failed");
      const tag = r.status === "completed" ? "✅" : r.status === "skipped" ? "⏭" : "❌";
      console.log(`  ${tag} ${r.date}  ${r.status.padEnd(9)} ${pub} salida(s)  ${failed ? "· falló en " + failed.stage : ""}  (${r.runId.slice(0, 8)})`);
      if (r.reason) console.log(`        ${r.reason}`);
    }
    console.log("");
  });

program
  .command("estimate")
  .description("Estimate monthly AI cost for a channel; --infra compares API vs self-host")
  .argument("<channel>", "channel id or path")
  .option("--infra", "also compare cloud APIs vs self-hosted GPU options", false)
  .action(async (channel: string, opts: { infra?: boolean }) => {
    const def = await loadChannelDefinition(resolveConfig(channel));
    const { estimateChannel, formatEstimate, estimateInfra, formatInfra } = await import("../ops/estimate.js");
    console.log(formatEstimate(def, estimateChannel(def)));
    if (opts.infra) console.log(formatInfra(def, estimateInfra(def)));
  });

program
  .command("localize")
  .description("Derive localized child channels from a base channel (multi-idioma)")
  .argument("<channel>", "base channel id or path")
  .requiredOption("--to <langs>", "comma-separated language codes, e.g. en,pt,fr")
  .option("-o, --out <dir>", "output directory", "src/config")
  .action(async (channel: string, opts: { to: string; out: string }) => {
    const base = await loadChannelDefinition(resolveConfig(channel));
    const { localizeChannel } = await import("../genesis/localize.js");
    const { getLlmClient } = await import("../engine/llm/client.js");
    const client = getLlmClient(base.script.provider);
    const dir = resolve(process.cwd(), opts.out);
    await mkdir(dir, { recursive: true });
    for (const lang of opts.to.split(",").map((s) => s.trim()).filter(Boolean)) {
      const child = await localizeChannel(base, lang, client);
      const path = resolve(dir, `${child.id}.yaml`);
      await writeFile(path, toYaml(child));
      console.log(`  ${lang} → ${child.id}  (${path})`);
    }
    console.log("\nRevisa los hijos (status: draft) y actívalos cuando quieras.");
  });

program
  .command("trends")
  .description("Show trending topics (Google Trends / Reddit) for a region")
  .option("-s, --source <src>", "google | reddit", "google")
  .option("-g, --geo <geo>", "region code (google)", "ES")
  .action(async (opts: { source: any; geo: string }) => {
    const { fetchTrends } = await import("../trends/index.js");
    const trends = await fetchTrends(opts.source, opts.geo);
    if (trends.length === 0) {
      console.log("No se pudieron obtener tendencias (¿sin red?).");
      return;
    }
    console.log(`\nTendencias (${opts.source}, ${opts.geo}):`);
    trends.forEach((t, i) => console.log(`  ${String(i + 1).padStart(2)}. ${t}`));
  });

program
  .command("experiments")
  .description("Propose/track A-B experiments (title, time, format, duration) from metrics")
  .argument("<channel>", "channel id")
  .option("-m, --metrics <file>", "metrics JSON (defaults to out/_db/metrics/<id>.json)")
  .action(async (channel: string, opts: { metrics?: string }) => {
    const def = await loadChannelDefinition(resolveConfig(channel));
    const path = opts.metrics ? resolve(process.cwd(), opts.metrics) : join(dbDir(), "metrics", `${channel}.json`);
    let metrics: any[] = [];
    try { metrics = JSON.parse(await readFile(path, "utf8")); } catch { /* none yet */ }
    const { proposeExperiments } = await import("../analytics/experiments.js");
    const exps = proposeExperiments(def, metrics);
    console.log(`\nExperimentos para ${channel} (${metrics.length} datos):`);
    for (const e of exps) {
      const icon = e.status === "concluded" ? "🏁" : e.status === "running" ? "🔬" : "💡";
      console.log(`  ${icon} [${e.variable}] ${e.status}`);
      console.log(`     ${e.note}`);
    }
    console.log("");
  });

program
  .command("dashboard")
  .description("Serve the web dashboard / SaaS UI (channels, runs, cost, create wizard)")
  .option("-p, --port <port>", "port", "8787")
  .option("--open", "open the browser automatically", false)
  .action(async (opts: { port: string; open?: boolean }) => {
    const { startDashboard, openBrowser } = await import("../ops/dashboard.js");
    startDashboard(Number(opts.port));
    const url = `http://localhost:${opts.port}`;
    console.log(`\n  🏭 Channel Factory UI → ${url}\n  (Ctrl+C para salir)\n`);
    if (opts.open) openBrowser(url);
  });

function collect(v: string, acc: string[]): string[] {
  acc.push(v);
  return acc;
}

program
  .command("backlog")
  .description("Manage a channel's idea backlog (consumed by the generative adapter)")
  .argument("<channel>", "channel id")
  .option("--add <idea>", "add an idea (repeatable)", collect, [])
  .action(async (channel: string, opts: { add: string[] }) => {
    const { addToBacklog, loadBacklog } = await import("../storage/backlog.js");
    if (opts.add.length) {
      const n = await addToBacklog(channel, opts.add);
      console.log(`Añadidas ${n} idea(s) al backlog de ${channel}.`);
    }
    const items = await loadBacklog(channel);
    console.log(`\nBacklog de ${channel} (${items.length}):`);
    for (const it of items) console.log(`  ${it.usedDate ? "✓ " + it.usedDate : "·         "}  ${it.angle}`);
    if (items.length === 0) console.log("  (vacío — añade con --add \"idea\")");
  });

program
  .command("regenerate")
  .description("Re-make a piece with a different style/voice/angle (new version)")
  .argument("<channel>", "channel id or path")
  .argument("<date>", "target date (YYYY-MM-DD)")
  .option("--style <style>", "override visual style")
  .option("--voice <provider>", "override voice provider")
  .option("--reroll", "force a different generative angle", false)
  .option("--dry-run", "don't publish", false)
  .action(async (channel: string, date: string, opts: { style?: string; voice?: string; reroll?: boolean; dryRun?: boolean }) => {
    const def = JSON.parse(JSON.stringify(await loadChannelDefinition(resolveConfig(channel))));
    if (opts.style && def.video) def.video.style = opts.style;
    if (opts.voice) def.voice.provider = opts.voice;
    if (opts.reroll) def.data.config = { ...(def.data.config ?? {}), rerollSeed: Math.floor(Math.random() * 1000) + 1 };
    const outcome = await runChannel(def, { date, dryRun: opts.dryRun });
    console.log(`Regenerado ${def.id} ${date} — ${outcome.status}`);
    if (outcome.status === "completed") console.log(`  nuevo titular: ${outcome.ctx.payload?.headlineFact}`);
  });

program
  .command("run-all")
  .description("Run one cycle for every active channel (bulk)")
  .option("-d, --date <iso>", "target date (YYYY-MM-DD)")
  .option("--dry-run", "do everything except publishing", false)
  .action(async (opts: { date?: string; dryRun?: boolean }) => {
    const { configDir } = await import("../storage/paths.js");
    const { readdir } = await import("node:fs/promises");
    const dir = configDir();
    const files = (await readdir(dir).catch(() => [])).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
    let ran = 0;
    for (const f of files) {
      try {
        const def = await loadChannelDefinition(resolve(dir, f));
        if (def.status !== "active") continue;
        const o = await runChannel(def, { date: opts.date, dryRun: opts.dryRun });
        console.log(`  ${def.id}: ${o.status}`);
        ran++;
      } catch (e) {
        console.log(`  ${f}: error ${(e as Error).message}`);
      }
    }
    console.log(`\n${ran} canal(es) activos ejecutados.`);
  });

program
  .command("pending")
  .description("List runs held for approval")
  .action(async () => {
    const { listPending } = await import("../storage/pending.js");
    const recs = await listPending();
    if (recs.length === 0) return console.log("No hay nada pendiente de aprobación.");
    console.log("\nPendientes de aprobación:");
    for (const r of recs) console.log(`  ${r.channelId} ${r.date} — ${r.items.length} salida(s)  (factory approve ${r.channelId} ${r.date})`);
  });

program
  .command("approve")
  .description("Approve & publish a held run")
  .argument("<channel>", "channel id")
  .argument("<date>", "run date (YYYY-MM-DD)")
  .action(async (channel: string, date: string) => {
    const { approvePending } = await import("../engine/publish/approve.js");
    const results = await approvePending(channel, date);
    console.log(`Aprobado ${channel} ${date}:`);
    for (const r of results) console.log(`  ${r.platform}/${r.format}: ${r.status} ${r.url ?? r.queuedItemPath ?? ""}`);
  });

program
  .command("reject")
  .description("Discard a held run")
  .argument("<channel>", "channel id")
  .argument("<date>", "run date (YYYY-MM-DD)")
  .action(async (channel: string, date: string) => {
    const { rejectPending } = await import("../engine/publish/approve.js");
    await rejectPending(channel, date);
    console.log(`Descartado ${channel} ${date}.`);
  });

program
  .command("hardware")
  .description("Detect your machine and recommend what you can run locally")
  .action(async () => {
    const { runHardware } = await import("../ops/hardware.js");
    await runHardware();
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
  .command("optimize")
  .description("Apply the feedback loop to the config (auto-tune publish times)")
  .argument("<channel>", "channel id")
  .option("-m, --metrics <file>", "metrics JSON (defaults to out/_db/metrics/<id>.json)")
  .option("--apply", "save the changes (otherwise just preview)", false)
  .action(async (channel: string, opts: { metrics?: string; apply?: boolean }) => {
    const def = await loadChannelDefinition(resolveConfig(channel));
    const path = opts.metrics ? resolve(process.cwd(), opts.metrics) : join(dbDir(), "metrics", `${channel}.json`);
    let metrics: any[] = [];
    try { metrics = JSON.parse(await readFile(path, "utf8")); } catch { /* none */ }
    const { optimizeChannel } = await import("../analytics/optimize.js");
    const { channel: next, changes } = optimizeChannel(def, metrics);
    if (changes.length === 0) return console.log("Sin cambios recomendados (faltan datos o ya está óptimo).");
    console.log(`\nCambios para ${channel}:`);
    for (const c of changes) console.log(`  • ${c}`);
    if (opts.apply) {
      const { saveChannelDefinition } = await import("../config/loader.js");
      await saveChannelDefinition(next);
      console.log("\n✅ Aplicado y guardado.");
    } else {
      console.log("\n(Previsualización — usa --apply para guardar.)");
    }
  });

program
  .command("clone")
  .description("Duplicate a channel config as a template (new id, status draft)")
  .argument("<source>", "source channel id or path")
  .argument("<newId>", "new channel id")
  .action(async (source: string, newId: string) => {
    const def = JSON.parse(JSON.stringify(await loadChannelDefinition(resolveConfig(source))));
    def.id = newId;
    def.status = "draft";
    for (const p of def.platforms) p.account_ref = p.account_ref.replace(/[^/]+$/, newId);
    const { saveChannelDefinition } = await import("../config/loader.js");
    await saveChannelDefinition(def);
    console.log(`Clonado ${source} → ${newId} (status: draft).`);
  });

program
  .command("export")
  .description("Export a channel config (recipe) to YAML")
  .argument("<channel>", "channel id")
  .option("-o, --out <file>", "write to file instead of stdout")
  .action(async (channel: string, opts: { out?: string }) => {
    const def = await loadChannelDefinition(resolveConfig(channel));
    const yaml = toYaml(def);
    if (opts.out) {
      await writeFile(resolve(process.cwd(), opts.out), yaml);
      console.log(`Exportado a ${opts.out}`);
    } else {
      process.stdout.write(yaml);
    }
  });

program
  .command("import")
  .description("Import a channel config (recipe) from a YAML/JSON file")
  .argument("<file>", "path to the config file")
  .action(async (file: string) => {
    const { loadChannelDefinition: load, saveChannelDefinition } = await import("../config/loader.js");
    const def = await load(resolve(process.cwd(), file));
    await saveChannelDefinition(def);
    console.log(`Importado: ${def.id}`);
  });

program
  .command("metrics:pull")
  .description("Pull real YouTube stats into the metrics file (needs FACTORY_YT_API_KEY)")
  .argument("<channel>", "channel id")
  .action(async (channel: string) => {
    const { pullChannelMetrics } = await import("../analytics/youtube.js");
    const r = await pullChannelMetrics(channel);
    console.log(r.reason ? `No se actualizó: ${r.reason}` : `Métricas actualizadas: ${r.updated} publicación(es).`);
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
