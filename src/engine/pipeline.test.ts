import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { loadChannelDefinition } from "../config/loader.js";
import { runChannel } from "./run.js";

// Isolate generated artifacts in a temp dir.
process.env.FACTORY_DATA_DIR = mkdtempSync(join(tmpdir(), "factory-test-"));

describe("Engine pipeline (end-to-end, offline)", () => {
  it("runs a full cycle for luz-es using the fixture", async () => {
    const def = await loadChannelDefinition(resolve(process.cwd(), "src/config/luz-es.yaml"));
    const outcome = await runChannel(def, { date: "2026-06-21", dryRun: true });

    expect(outcome.status).toBe("completed");
    if (outcome.status !== "completed") return;

    const ctx = outcome.ctx;
    // payload computed and QA passed
    expect(ctx.payload?.headlineFact).toBeTruthy();
    expect(ctx.qa?.passed).toBe(true);
    // a script per enabled format (short + long)
    expect(ctx.scripts?.length).toBe(2);
    // audio + render produced
    expect(ctx.audio?.length).toBe(2);
    expect((ctx.rendered?.length ?? 0)).toBeGreaterThanOrEqual(2);
    // metadata for youtube(short,long) + tiktok(short) + instagram(short) = 4
    expect(ctx.metadata?.length).toBe(4);
    // dry-run => everything skipped, nothing actually published
    expect(ctx.publications?.every((p) => p.status === "skipped")).toBe(true);
    // every pipeline stage ran ok
    expect(ctx.stageRecords.every((s) => s.status === "ok")).toBe(true);
  });
});
