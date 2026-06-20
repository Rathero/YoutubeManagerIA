import { createServer } from "node:http";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { loadChannelDefinition } from "../config/loader.js";
import { getStore } from "../storage/index.js";
import { estimateChannel } from "./estimate.js";

const PAGE = `<!doctype html><html lang="es"><head><meta charset="utf-8"/>
<title>Channel Factory</title><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
 body{font:14px/1.5 system-ui,sans-serif;margin:0;background:#0b1220;color:#e5e7eb}
 header{padding:16px 24px;background:#111827;border-bottom:1px solid #1f2937}
 h1{margin:0;font-size:18px}main{padding:24px;max-width:1000px;margin:0 auto}
 table{width:100%;border-collapse:collapse;margin:8px 0 24px}
 th,td{text-align:left;padding:6px 10px;border-bottom:1px solid #1f2937}
 th{color:#9ca3af;font-weight:600}.ok{color:#34d399}.fail{color:#f87171}.skip{color:#fbbf24}
 .pill{background:#1f2937;border-radius:6px;padding:1px 8px;font-size:12px}
 a{color:#60a5fa}select{background:#111827;color:#e5e7eb;border:1px solid #374151;border-radius:6px;padding:4px}
</style></head><body>
<header><h1>🏭 Channel Factory — panel</h1></header>
<main>
 <h2>Canales</h2><table id="channels"><thead><tr><th>id</th><th>status</th><th>adapter</th><th>vídeo</th><th>coste/mes</th></tr></thead><tbody></tbody></table>
 <h2>Ejecuciones <select id="ch"></select></h2>
 <table id="runs"><thead><tr><th>fecha</th><th>estado</th><th>salidas</th><th>etapa fallida</th><th>run</th></tr></thead><tbody></tbody></table>
</main>
<script>
async function j(u){const r=await fetch(u);return r.json()}
function cls(s){return s==='completed'?'ok':s==='failed'?'fail':'skip'}
async function load(){
 const chs=await j('/api/channels');
 document.querySelector('#channels tbody').innerHTML=chs.map(c=>
   '<tr><td>'+c.id+'</td><td><span class=pill>'+c.status+'</span></td><td>'+c.adapter+'</td><td>'+c.video+'</td><td>'+(c.cost===0?'<span class=ok>$0 (local)</span>':'$'+c.cost)+'</td></tr>').join('');
 const sel=document.getElementById('ch');
 sel.innerHTML=chs.map(c=>'<option>'+c.id+'</option>').join('');
 sel.onchange=()=>runs(sel.value);
 if(chs[0])runs(chs[0].id);
}
async function runs(id){
 const rs=await j('/api/runs?channel='+encodeURIComponent(id));
 document.querySelector('#runs tbody').innerHTML=rs.map(r=>{
  const f=(r.stages||[]).find(s=>s.status==='failed');
  return '<tr><td>'+r.date+'</td><td class='+cls(r.status)+'>'+r.status+'</td><td>'+(r.publications||[]).length+'</td><td>'+(f?f.stage:'')+'</td><td>'+r.runId.slice(0,8)+'</td></tr>';
 }).join('')||'<tr><td colspan=5>sin ejecuciones</td></tr>';
}
load();
</script></body></html>`;

async function listChannels(): Promise<Array<{ id: string; status: string; adapter: string; video: string; cost: number }>> {
  const dir = resolve(process.cwd(), "src/config");
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
      out.push({
        id: def.id,
        status: def.status,
        adapter: def.data.adapter,
        video: def.video?.mode ?? def.render.engine,
        cost: estimateChannel(def).perMonthUsd,
      });
    } catch {
      /* skip invalid config */
    }
  }
  return out;
}

export function startDashboard(port = 8787): ReturnType<typeof createServer> {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname === "/api/channels") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(await listChannels()));
        return;
      }
      if (url.pathname === "/api/runs") {
        const channel = url.searchParams.get("channel") ?? "";
        const store = await getStore();
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(await store.listRuns(channel, 50)));
        return;
      }
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(PAGE);
    } catch (err) {
      res.statusCode = 500;
      res.end(String((err as Error).message));
    }
  });
  server.listen(port);
  return server;
}
