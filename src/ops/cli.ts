#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { stringify as toYaml } from "yaml";
import { Command } from "commander";
import { loadChannelDefinition, defaultConfigPath } from "../config/loader.js";
import { validateChannel } from "../config/validate.js";
import { runChannel } from "../engine/run.js";
import { runGenesis } from "../genesis/index.js";
import { listAdapters } from "../adapters/registry.js";

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
  .command("genesis")
  .description("Phase A: turn a topic into a draft ChannelDefinition + strategy report")
  .requiredOption("-t, --topic <topic>", "the niche idea")
  .option("-l, --language <lang>", "language tag", "es-ES")
  .option("-r, --region <region>", "region code", "ES")
  .option("-o, --out <dir>", "output directory", "out/genesis")
  .action(async (opts: { topic: string; language: string; region: string; out: string }) => {
    const result = await runGenesis({ topic: opts.topic, language: opts.language, region: opts.region });
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

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
