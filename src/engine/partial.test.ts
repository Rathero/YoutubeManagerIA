import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolve } from "node:path";
import { loadChannelDefinition } from "../config/loader.js";
import { runChannel } from "./run.js";

process.env.FACTORY_DATA_DIR = mkdtempSync(join(tmpdir(), "cf-partial-"));

describe("partial re-render (inject payload + edited scripts)", () => {
  it("skips ingest/compute/script and uses the provided narration", async () => {
    const def = await loadChannelDefinition(resolve(process.cwd(), "src/config/luz-es.yaml"));
    const payload = {
      channelId: "luz-es", date: "2026-06-21", headlineFact: "Titular editado",
      keyMetrics: [{ label: "a", value: "1", emphasis: "primary" }, { label: "b", value: "2", emphasis: "secondary" }],
      segments: [{ title: "s", detail: "d" }], sourceRef: { name: "x" }, safety: { factsVerified: true },
    } as any;
    const scripts = [{ format: "short", sections: { edited: "Narración editada a mano" }, narration: "Narración editada a mano", wordCount: 4 }] as any;

    const outcome = await runChannel(def, { date: "2026-06-21", dryRun: true, inject: { payload, scripts } });
    expect(outcome.status).toBe("completed");
    if (outcome.status !== "completed") return;
    // The first stage that ran is moderation (not ingest/compute/script).
    expect(outcome.ctx.stageRecords[0]!.stage).toBe("moderation");
    expect(outcome.ctx.payload!.headlineFact).toBe("Titular editado");
    expect(outcome.ctx.scripts![0]!.narration).toBe("Narración editada a mano");
  });
});
