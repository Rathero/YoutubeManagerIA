import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { stringify as toYaml } from "yaml";
import { loadChannelDefinition } from "../config/loader.js";
import { configDir, dbDir, tenant } from "../storage/paths.js";
import { getStore } from "../storage/index.js";
import { estimateChannel } from "./estimate.js";
import { recommendStrategy } from "../genesis/recommend.js";
import { buildDefinitionFromRecommendation } from "../genesis/wizard.js";
import { runChannel } from "../engine/run.js";
import { proposeExperiments } from "../analytics/experiments.js";
import { BUILT_IN_STYLES } from "../engine/visuals/style.js";
import { probeLocalServices } from "./doctor.js";
import { UI_HTML } from "./web/ui.js";

function send(res: ServerResponse, status: number, obj: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}

async function readBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

async function listChannels() {
  const dir = configDir();
  let files: string[] = [];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  } catch {
    return [];
  }
  const out = [];
  for (const f of files) {
    try {
      const def = await loadChannelDefinition(resolve(dir, f));
      out.push({ id: def.id, status: def.status, adapter: def.data.adapter, video: def.video?.mode ?? def.render.engine, cost: estimateChannel(def).perMonthUsd });
    } catch {
      /* skip invalid */
    }
  }
  return out;
}

async function channelDetail(id: string) {
  const def = await loadChannelDefinition(resolve(configDir(), `${id}.yaml`));
  const store = await getStore();
  const runs = await store.listRuns(id, 30);
  return {
    name: def.identity.name,
    topic: def.niche.topic,
    status: def.status,
    adapter: def.data.adapter,
    video: def.video?.mode ?? def.render.engine,
    style: def.video?.style,
    cost: estimateChannel(def).perMonthUsd,
    runs,
  };
}

async function loadMetrics(id: string): Promise<any[]> {
  try {
    return JSON.parse(await readFile(resolve(dbDir(), "metrics", `${id}.json`), "utf8"));
  } catch {
    return [];
  }
}

/** Open the default browser at a URL (best-effort, cross-platform). */
export function openBrowser(url: string): void {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
  } catch {
    /* ignore */
  }
}

export function startDashboard(port = 8787): ReturnType<typeof createServer> {
  const token = process.env.FACTORY_DASHBOARD_TOKEN;
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const path = url.pathname;

      // Optional token gate for the API.
      if (token && path.startsWith("/api/") && path !== "/api/health" && req.headers["x-factory-token"] !== token) {
        return send(res, 401, { error: "unauthorized" });
      }

      if (path === "/" || path === "/index.html") {
        res.setHeader("content-type", "text/html; charset=utf-8");
        return res.end(UI_HTML);
      }
      if (path === "/api/health") return send(res, 200, { ok: true, tenant: tenant() || "default" });
      if (path === "/api/hardware") {
        const { detectHardware, recommend } = await import("./hardware.js");
        const hw = await detectHardware();
        return send(res, 200, { hw, rec: recommend(hw) });
      }
      if (path === "/api/doctor") {
        const r = await probeLocalServices();
        return send(res, 200, { llm: r.llm.ok, llmModel: r.llmModel, tts: r.tts.ok, comfyui: r.comfyui.ok, ffmpeg: r.ffmpeg.ok });
      }
      if (path === "/api/channels" && req.method === "GET") return send(res, 200, await listChannels());

      if (path === "/api/library") {
        const { searchLibrary } = await import("../storage/library.js");
        return send(res, 200, await searchLibrary(url.searchParams.get("q") ?? "", 150));
      }
      if (path === "/api/calendar") {
        const { calendarFor } = await import("../storage/calendar.js");
        return send(res, 200, await calendarFor(url.searchParams.get("channel") ?? ""));
      }

      if (path === "/api/recommend") {
        const topic = url.searchParams.get("topic") ?? "";
        const local = url.searchParams.get("local") === "true";
        const rec = await recommendStrategy(topic, { language: "es-ES" });
        if (local) { rec.voiceProvider = "kokoro" as any; rec.videoProvider = "comfyui" as any; }
        return send(res, 200, { ...rec, styleOptions: [...Object.keys(BUILT_IN_STYLES), "data_card"] });
      }

      if (path === "/api/channels" && req.method === "POST") {
        const b = await readBody(req);
        if (!b.topic) return send(res, 400, { error: "topic required" });
        const rec = await recommendStrategy(b.topic, { language: b.language });
        if (b.style) { rec.style = b.style; rec.videoMode = b.style === "data_card" || rec.contentKind === "data" ? "data_card" : "generative"; }
        if (b.voiceProvider) rec.voiceProvider = b.voiceProvider;
        if (b.videoProvider) rec.videoProvider = b.videoProvider;
        const def = buildDefinitionFromRecommendation(b.topic, rec, { language: b.language, region: b.region, local: b.local });
        const dir = configDir();
        await mkdir(dir, { recursive: true });
        await writeFile(resolve(dir, `${def.id}.yaml`), toYaml(def));
        return send(res, 200, { id: def.id });
      }

      const detailMatch = path.match(/^\/api\/channels\/([^/]+)$/);
      if (detailMatch) return send(res, 200, await channelDetail(decodeURIComponent(detailMatch[1]!)));

      const expMatch = path.match(/^\/api\/channels\/([^/]+)\/experiments$/);
      if (expMatch) {
        const id = decodeURIComponent(expMatch[1]!);
        const def = await loadChannelDefinition(resolve(configDir(), `${id}.yaml`));
        return send(res, 200, proposeExperiments(def, await loadMetrics(id)));
      }

      const pendMatch = path.match(/^\/api\/channels\/([^/]+)\/pending$/);
      if (pendMatch) {
        const id = decodeURIComponent(pendMatch[1]!);
        const { listPending } = await import("../storage/pending.js");
        return send(res, 200, (await listPending()).filter((p) => p.channelId === id));
      }
      const approveMatch = path.match(/^\/api\/channels\/([^/]+)\/(approve|reject)$/);
      if (approveMatch && req.method === "POST") {
        const id = decodeURIComponent(approveMatch[1]!);
        const action = approveMatch[2];
        const body = await readBody(req);
        const date = body.date as string;
        if (!date) return send(res, 400, { error: "date required" });
        const mod = await import("../engine/publish/approve.js");
        if (action === "approve") return send(res, 200, { results: await mod.approvePending(id, date) });
        await mod.rejectPending(id, date);
        return send(res, 200, { ok: true });
      }

      const runMatch = path.match(/^\/api\/channels\/([^/]+)\/run$/);
      if (runMatch && req.method === "POST") {
        const id = decodeURIComponent(runMatch[1]!);
        const def = await loadChannelDefinition(resolve(configDir(), `${id}.yaml`));
        const outcome = await runChannel(def, { dryRun: true });
        const detail = outcome.status === "failed" ? `${outcome.stage}: ${outcome.error.message}` : `${(outcome.ctx.publications ?? []).length} salidas`;
        return send(res, 200, { status: outcome.status, detail });
      }

      if (path === "/api/runs") {
        const store = await getStore();
        return send(res, 200, await store.listRuns(url.searchParams.get("channel") ?? "", 50));
      }

      send(res, 404, { error: "not found" });
    } catch (err) {
      send(res, 500, { error: (err as Error).message });
    }
  });
  server.listen(port);
  return server;
}
