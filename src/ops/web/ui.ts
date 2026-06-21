/** The single-page SaaS UI (no build step, no deps) served by the dashboard server. */
export const UI_HTML = String.raw`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Channel Factory</title>
<style>
:root{
 --bg:#0a0e1a; --surface:#111726; --surface2:#161d30; --border:#222b41;
 --fg:#e8ecf6; --muted:#94a0bb; --accent:#7c6cff; --accent2:#22d3ee;
 --ok:#34d399; --warn:#fbbf24; --bad:#fb7185; --radius:16px;
 --shadow:0 8px 30px rgba(0,0,0,.35);
}
*{box-sizing:border-box}
body{margin:0;font:14px/1.55 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--fg)}
a{color:inherit;text-decoration:none}
.app{display:grid;grid-template-columns:248px 1fr;min-height:100vh}
/* Sidebar */
.side{background:linear-gradient(180deg,#0d1220,#0a0e1a);border-right:1px solid var(--border);padding:20px 14px;position:sticky;top:0;height:100vh}
.brand{display:flex;align-items:center;gap:10px;padding:6px 10px 18px}
.logo{width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,var(--accent),var(--accent2));display:grid;place-items:center;font-size:18px;box-shadow:var(--shadow)}
.brand b{font-size:15px;letter-spacing:.2px}
.brand small{display:block;color:var(--muted);font-size:11px;font-weight:500}
.nav a{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;color:var(--muted);font-weight:600;margin:2px 0}
.nav a:hover{background:var(--surface);color:var(--fg)}
.nav a.active{background:var(--surface2);color:var(--fg)}
.nav .ic{width:18px;text-align:center}
.side .foot{position:absolute;bottom:16px;left:14px;right:14px;color:var(--muted);font-size:11px}
/* Main */
.main{padding:28px 34px;max-width:1080px}
.h1{font-size:24px;font-weight:800;letter-spacing:-.3px;margin:0 0 2px}
.sub{color:var(--muted);margin:0 0 22px}
.row{display:flex;gap:16px;flex-wrap:wrap}
.grid{display:grid;gap:16px}
.cards{grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:18px;box-shadow:var(--shadow)}
.card h3{margin:0 0 4px;font-size:15px}
.kpi{display:flex;flex-direction:column;gap:6px}
.kpi .n{font-size:30px;font-weight:800;letter-spacing:-1px}
.kpi .l{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.6px}
.chip{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:600;background:var(--surface2);border:1px solid var(--border)}
.chip.ok{color:var(--ok)} .chip.bad{color:var(--bad)} .chip.warn{color:var(--warn)}
.dot{width:8px;height:8px;border-radius:50%;background:currentColor;display:inline-block}
.btn{display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border-radius:12px;border:1px solid var(--border);background:var(--surface2);color:var(--fg);font-weight:700;cursor:pointer;font-size:14px}
.btn:hover{border-color:#33406040}
.btn.primary{background:linear-gradient(135deg,var(--accent),#5b8cff);border:none;box-shadow:var(--shadow)}
.btn.ghost{background:transparent}
.btn:disabled{opacity:.5;cursor:not-allowed}
table{width:100%;border-collapse:collapse}
th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--border);font-size:13px}
th{color:var(--muted);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.5px}
input,select,textarea{width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:12px;color:var(--fg);padding:11px 13px;font:inherit;outline:none}
input:focus,select,textarea:focus{border-color:var(--accent)}
textarea{min-height:96px;resize:vertical}
label{display:block;font-weight:700;margin:14px 0 6px;font-size:13px}
.hint{color:var(--muted);font-size:12px;margin-top:4px}
.toggle{display:flex;align-items:center;gap:10px;background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:11px 13px;cursor:pointer}
.toggle input{width:auto}
.steps{display:flex;gap:8px;margin-bottom:18px}
.steps .s{flex:1;height:6px;border-radius:999px;background:var(--surface2)}
.steps .s.on{background:linear-gradient(90deg,var(--accent),var(--accent2))}
.reco{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.reco .item{background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:12px}
.reco .item .l{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.5px}
.reco .item .v{font-weight:700;font-size:15px;margin-top:2px}
.banner{background:linear-gradient(135deg,rgba(124,108,255,.16),rgba(34,211,238,.10));border:1px solid var(--border);border-radius:var(--radius);padding:22px 24px;margin-bottom:22px}
.muted{color:var(--muted)}
.spin{display:inline-block;width:16px;height:16px;border:2px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:sp 1s linear infinite}
@keyframes sp{to{transform:rotate(360deg)}}
@media(max-width:820px){.app{grid-template-columns:1fr}.side{position:static;height:auto}.reco{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="app">
 <aside class="side">
  <div class="brand"><div class="logo">🏭</div><div><b>Channel Factory</b><small id="tenant">workspace</small></div></div>
  <nav class="nav" id="nav">
   <a href="#/" data-r="/"><span class="ic">🏠</span> <span data-t="home">Inicio</span></a>
   <a href="#/create" data-r="/create"><span class="ic">✨</span> <span data-t="create">Crear canal</span></a>
   <a href="#/channels" data-r="/channels"><span class="ic">📺</span> <span data-t="channels">Canales</span></a>
   <a href="#/library" data-r="/library"><span class="ic">📚</span> <span data-t="library">Biblioteca</span></a>
   <a href="#/calendar" data-r="/calendar"><span class="ic">🗓️</span> <span data-t="calendar">Calendario</span></a>
   <a href="#/setup" data-r="/setup"><span class="ic">🩺</span> <span data-t="setup">Estado local</span></a>
  </nav>
  <div class="foot"><select id="lang" style="width:100%;margin-bottom:8px"><option value="es">Español</option><option value="en">English</option></select>Sin código · Cloud o local ($0)<br/>v0.1 · 2026</div>
 </aside>
 <main class="main" id="app"><div class="spin"></div></main>
</div>
<script>
const $=(s,e=document)=>e.querySelector(s);
const app=$('#app');
// Lightweight i18n for the navigation/shell.
const LANG=localStorage.getItem('cf_lang')||'es';
const I18N={es:{home:'Inicio',create:'Crear canal',channels:'Canales',library:'Biblioteca',calendar:'Calendario',setup:'Estado local'},
 en:{home:'Home',create:'Create channel',channels:'Channels',library:'Library',calendar:'Calendar',setup:'Local status'}};
const t=k=>(I18N[LANG]||I18N.es)[k]||k;
function applyI18n(){document.querySelectorAll('[data-t]').forEach(el=>{el.textContent=t(el.dataset.t)});const s=$('#lang');if(s){s.value=LANG;s.onchange=()=>{localStorage.setItem('cf_lang',s.value);location.reload()}}}
// Token (for protected/public dashboards): open with ?token=XYZ once; it's remembered.
const TOKEN=new URLSearchParams(location.search).get('token')||localStorage.getItem('cf_token')||'';
if(TOKEN)localStorage.setItem('cf_token',TOKEN);
const api=async(u,opt={})=>{
 opt.headers=Object.assign({},opt.headers,TOKEN?{'x-factory-token':TOKEN}:{});
 const r=await fetch(u,opt);if(!r.ok)throw new Error((await r.text())||r.status);return r.json()};
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const pill=s=>{const c=s==='active'?'ok':s==='draft'?'warn':'';return '<span class="chip '+c+'"><span class="dot"></span>'+esc(s)+'</span>'};
const money=n=>n===0?'<span class="chip ok">$0 · local</span>':'$'+n+'<span class="muted">/mes</span>';
function setActive(r){document.querySelectorAll('#nav a').forEach(a=>a.classList.toggle('active',a.dataset.r===r))}

async function viewHome(){
 setActive('/');
 let ch=[],doc={},hwr={};
 try{ch=await api('/api/channels')}catch{}
 try{doc=await api('/api/doctor')}catch{}
 try{hwr=await api('/api/hardware')}catch{}
 const cost=ch.reduce((s,c)=>s+(c.cost||0),0);
 const chip=(ok,l)=>'<span class="chip '+(ok?'ok':'bad')+'"><span class="dot"></span>'+l+'</span>';
 app.innerHTML=\`
  <div class="banner">
   <div class="h1">Crea canales faceless automáticos ✨</div>
   <p class="sub">Describe una temática y el sistema elige modelo, estilo y voz por ti. Cloud o 100% local.</p>
   <a class="btn primary" href="#/create">✨ Crear un canal</a>
  </div>
  <div class="grid cards" style="margin-bottom:22px">
   <div class="card kpi"><span class="l">Canales</span><span class="n">\${ch.length}</span></div>
   <div class="card kpi"><span class="l">Coste estimado</span><span class="n">$\${Math.round(cost)}<span class="muted" style="font-size:14px">/mes</span></span></div>
   <div class="card kpi"><span class="l">Activos</span><span class="n">\${ch.filter(c=>c.status==='active').length}</span></div>
  </div>
  <div class="card">
   <h3>Estado de IA local ($0)</h3>
   <div class="row" style="margin-top:10px">
    \${chip(doc.llm,'LLM '+(doc.llm?'online':'offline'))}
    \${chip(doc.tts,'Voz '+(doc.tts?'online':'offline'))}
    \${chip(doc.comfyui,'ComfyUI '+(doc.comfyui?'online':'offline'))}
    \${chip(doc.ffmpeg,'ffmpeg '+(doc.ffmpeg?'ok':'falta'))}
   </div>
   <p class="hint">¿Sin servidores? Ejecuta <code>npm run setup:local</code>. El pipeline corre igual en modo demo.</p>
  </div>
  \${hwr.hw?hwCard(hwr):''}\`;
}
function hwCard(h){
 const hw=h.hw,r=h.rec;
 const gpu=hw.gpu?(hw.gpu.name+' · '+Math.round(hw.gpu.vramMB/1024)+'GB VRAM'):(hw.appleSilicon?'Apple Silicon (Metal)':'sin GPU NVIDIA');
 const tag=(ok,txt)=>'<span class="chip '+(ok?'ok':'warn')+'"><span class=dot></span>'+txt+'</span>';
 const llm={'small':'LLM 3-4B','medium':'LLM 8-14B','large':'LLM 70B','cloud-only':'LLM solo nube'}[r.localLLM];
 return \`<div class="card" style="margin-top:16px">
   <div class="row" style="justify-content:space-between;align-items:center"><h3>Tu equipo</h3><span class="muted">\${hw.ramGB}GB RAM · \${hw.cpus} CPU · \${esc(gpu)}</span></div>
   <p class="muted" style="margin:6px 0 10px">Lo que puedes correr en local ($0):</p>
   <div class="row">
    \${tag(r.localLLM!=='cloud-only',llm)}
    \${tag(r.image!=='cloud-only',r.image==='cloud-only'?'Imagen: nube':'Imagen: '+r.image)}
    \${tag(r.video==='local-ok',r.video==='local-ok'?'Vídeo local OK':'Vídeo: nube')}
    \${tag(true,'Voz: Kokoro (CPU)')}
   </div>
   <p class="hint" style="margin-top:10px">\${esc((r.notes&&r.notes[0])||'')} · Detalle en HARDWARE.md</p>
  </div>\`;
}

async function viewChannels(){
 setActive('/channels');
 let ch=[];try{ch=await api('/api/channels')}catch{}
 app.innerHTML='<div class="h1">Canales</div><p class="sub">'+ch.length+' canal(es) en este workspace.</p>'+
  (ch.length?'<div class="grid cards">'+ch.map(c=>\`
   <div class="card">
    <div class="row" style="justify-content:space-between;align-items:start">
     <h3>\${esc(c.id)}</h3>\${pill(c.status)}
    </div>
    <p class="muted" style="margin:6px 0 12px">\${esc(c.adapter)} · \${esc(c.video)}</p>
    <div class="row" style="justify-content:space-between;align-items:center">
     <span>\${money(c.cost)}</span>
     <a class="btn ghost" href="#/channel/\${encodeURIComponent(c.id)}">Ver →</a>
    </div>
   </div>\`).join('')+'</div>'
   :'<div class="card">Aún no hay canales. <a href="#/create">Crea el primero →</a></div>');
}

async function viewChannel(id){
 setActive('/channels');
 app.innerHTML='<div class="spin"></div>';
 let d;try{d=await api('/api/channels/'+encodeURIComponent(id))}catch(e){app.innerHTML='<div class="card">No encontrado.</div>';return}
 const runs=d.runs||[];
 const cls=s=>s==='completed'?'ok':s==='failed'?'bad':'warn';
 let exp='';try{const ex=await api('/api/channels/'+encodeURIComponent(id)+'/experiments');exp=ex.map(e=>'<div class="reco"><div class="item" style="grid-column:1/3"><div class="l">'+esc(e.variable)+' · '+esc(e.status)+'</div><div class="v" style="font-size:13px;font-weight:600">'+esc(e.note)+'</div></div></div>').join('')}catch{}
 let pend=[];try{pend=await api('/api/channels/'+encodeURIComponent(id)+'/pending')}catch{}
 let cfg=null;try{cfg=await api('/api/channels/'+encodeURIComponent(id)+'/config')}catch{}
 let last=null;try{last=await api('/api/channels/'+encodeURIComponent(id)+'/last')}catch{}
 const pendHtml=pend.length?'<div class="card" style="margin-bottom:18px;border-color:#7c6cff55"><h3>⏳ Pendiente de aprobación</h3>'+pend.map(p=>'<div class="row" style="justify-content:space-between;align-items:center;margin-top:8px"><span>'+esc(p.date)+' · '+p.items.length+' salida(s)</span><span><button class="btn primary" data-ap="'+esc(p.date)+'">Aprobar y publicar</button> <button class="btn ghost" data-rj="'+esc(p.date)+'">Descartar</button></span></div>').join('')+'</div>':'';
 const opt=(v,sel)=>'<option '+(v===sel?'selected':'')+'>'+v+'</option>';
 const styleOpts=['realistic','cinematic','documentary','anime','manga','comic','cartoon3d','claymation','pixelart','watercolor','data_card'];
 const editor=cfg?\`<div class="card" id="editor" style="display:none;margin-bottom:18px">
   <h3>Editar canal</h3>
   <div class="reco" style="margin-top:8px">
    <div class="item"><div class="l">Estado</div><select id="e_status">\${['draft','active','paused','archived'].map(v=>opt(v,cfg.status)).join('')}</select></div>
    <div class="item"><div class="l">Proveedor de texto</div><select id="e_text">\${['auto','anthropic','openai','gemini','local'].map(v=>opt(v,cfg.script.provider.name)).join('')}</select></div>
    <div class="item"><div class="l">Voz</div><select id="e_voice">\${['stub','elevenlabs','openai','google','kokoro','piper'].map(v=>opt(v,cfg.voice.provider)).join('')}</select></div>
    \${cfg.video?'<div class="item"><div class="l">Estilo</div><select id="e_style">'+styleOpts.map(v=>opt(v,cfg.video.style)).join('')+'</select></div>':''}
    <div class="item"><div class="l">Aprobación humana</div><label class="toggle"><input type="checkbox" id="e_appr" \${cfg.approval&&cfg.approval.required?'checked':''}/> <span>requerida</span></label></div>
    <div class="item"><div class="l">Hora publicación (cron)</div><input id="e_at" value="\${esc((cfg.schedule&&cfg.schedule.trigger&&cfg.schedule.trigger.at)||'')}"/></div>
    <div class="item" style="grid-column:1/3"><div class="l">Formatos activos</div>\${cfg.formats.map((f,i)=>'<label class="toggle" style="display:inline-flex;margin:4px 8px 0 0;width:auto"><input type="checkbox" data-fmt="'+i+'" '+(f.enabled?'checked':'')+'/> <span>'+esc(f.kind)+'</span></label>').join('')}</div>
    <div class="item" style="grid-column:1/3"><div class="l">Plataformas activas</div>\${cfg.platforms.map((p,i)=>'<label class="toggle" style="display:inline-flex;margin:4px 8px 0 0;width:auto"><input type="checkbox" data-plat="'+i+'" '+(p.enabled?'checked':'')+'/> <span>'+esc(p.id)+'</span></label>').join('')}</div>
   </div>
   <div style="margin-top:14px"><button class="btn primary" id="savecfg">Guardar</button> <button class="btn ghost" id="canceledit">Cancelar</button></div>
  </div>\`:'';
 let versions=[];if(last&&last.date){try{versions=await api('/api/channels/'+encodeURIComponent(id)+'/versions?date='+encodeURIComponent(last.date))}catch{}}
 const scriptCard=last&&last.payload&&(last.scripts||[]).length?\`<div class="card" style="margin-bottom:18px">
   <h3>Guion del último ciclo (\${esc(last.date||'')}) — editable</h3>
   <p style="font-weight:700">\${esc(last.payload.headlineFact||'')}</p>
   \${(last.scripts||[]).map(s=>'<label>'+esc(s.format)+'</label><textarea data-sf="'+esc(s.format)+'">'+esc(s.narration||'')+'</textarea>').join('')}
   <div style="margin-top:12px"><button class="btn primary" id="saveScript">Guardar y re-renderizar (preview)</button></div>
  </div>\`:'';
 const versCard=versions.length?\`<div class="card" style="margin-bottom:18px"><h3>Versiones de \${esc(last.date)}</h3>\${versions.map(v=>'<div class="row" style="justify-content:space-between;align-items:center;margin-top:8px"><span>'+esc((v.headline||'').slice(0,50))+' <span class=pill>'+esc(v.style||'-')+'</span> · '+v.files.length+' archivo(s)</span><button class="btn ghost" data-promote="'+esc(v.runId)+'">Promover</button></div>').join('')}</div>\`:'';
 app.innerHTML=\`
  <a class="muted" href="#/channels">← Canales</a>
  <div class="row" style="justify-content:space-between;align-items:center;margin-top:6px">
   <div class="h1" style="margin:0">\${esc(d.name||id)}</div>
   <span>\${pill(d.status)} <button class="btn ghost" id="editbtn">⚙ Editar</button></span>
  </div>
  <p class="sub">\${esc(d.topic||'')}</p>
  <div class="grid cards" style="margin-bottom:20px">
   <div class="card kpi"><span class="l">Coste</span><span class="n" style="font-size:22px">\${d.cost===0?'$0 local':'$'+d.cost+'/mes'}</span></div>
   <div class="card kpi"><span class="l">Adapter</span><span class="n" style="font-size:22px">\${esc(d.adapter)}</span></div>
   <div class="card kpi"><span class="l">Vídeo</span><span class="n" style="font-size:22px">\${esc(d.video)} · \${esc(d.style||'-')}</span></div>
  </div>
  \${editor}\${pendHtml}\${scriptCard}\${versCard}
  <div class="card" style="margin-bottom:18px">
   <div class="row" style="justify-content:space-between;align-items:center">
    <h3 style="margin:0">Ejecuciones</h3>
    <span><button class="btn ghost" id="regenbtn">🎲 Regenerar (otro ángulo)</button> <button class="btn" id="runbtn">▶ Probar (dry-run)</button></span>
   </div>
   <table style="margin-top:10px"><thead><tr><th>Fecha</th><th>Estado</th><th>Titular / estilo</th><th>Salidas</th></tr></thead><tbody>
    \${runs.length?runs.map(r=>'<tr><td>'+esc(r.date)+'</td><td><span class="chip '+cls(r.status)+'"><span class=dot></span>'+esc(r.status)+'</span></td><td>'+esc(((r.meta&&r.meta.headline)||'').slice(0,48))+(r.meta&&r.meta.style?' <span class=pill>'+esc(r.meta.style)+'</span>':'')+'</td><td>'+(r.publications||[]).length+'</td></tr>').join(''):'<tr><td colspan=4 class=muted>Sin ejecuciones aún</td></tr>'}
   </tbody></table>
  </div>
  <div class="card"><h3>Experimentos sugeridos</h3>\${exp||'<p class="muted">Recopila métricas para ver recomendaciones.</p>'}</div>\`;
 $('#editbtn').onclick=()=>{const e=$('#editor');if(e)e.style.display=e.style.display==='none'?'block':'none'};
 if($('#canceledit'))$('#canceledit').onclick=()=>{$('#editor').style.display='none'};
 if($('#savecfg'))$('#savecfg').onclick=async ev=>{ev.target.disabled=true;
  cfg.status=$('#e_status').value;cfg.script.provider.name=$('#e_text').value;cfg.voice.provider=$('#e_voice').value;
  if($('#e_style')&&cfg.video)cfg.video.style=$('#e_style').value;
  if(cfg.approval)cfg.approval.required=$('#e_appr').checked;else cfg.approval={required:$('#e_appr').checked};
  if(cfg.schedule&&cfg.schedule.trigger)cfg.schedule.trigger.at=$('#e_at').value;
  document.querySelectorAll('[data-fmt]').forEach(c=>{cfg.formats[+c.dataset.fmt].enabled=c.checked});
  document.querySelectorAll('[data-plat]').forEach(c=>{cfg.platforms[+c.dataset.plat].enabled=c.checked});
  try{await api('/api/channels/'+encodeURIComponent(id)+'/config',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(cfg)});location.reload()}
  catch(e){alert('Error al guardar: '+e.message);ev.target.disabled=false}};
 if($('#saveScript'))$('#saveScript').onclick=async ev=>{ev.target.disabled=true;ev.target.innerHTML='<span class="spin"></span>…';
  const scripts=[...document.querySelectorAll('[data-sf]')].map(t=>({format:t.dataset.sf,narration:t.value}));
  try{const o=await api('/api/channels/'+encodeURIComponent(id)+'/scripts',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({date:last.date,scripts})});alert('Re-renderizado: '+o.status);location.reload()}
  catch(e){alert('Error: '+e.message);ev.target.disabled=false;ev.target.textContent='Guardar y re-renderizar (preview)'}};
 document.querySelectorAll('[data-promote]').forEach(b=>b.onclick=async()=>{b.disabled=true;
  try{await api('/api/channels/'+encodeURIComponent(id)+'/promote',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({date:last.date,runId:b.dataset.promote})});alert('Versión promovida ✓')}catch(e){alert('Error: '+e.message);b.disabled=false}});
 $('#regenbtn').onclick=async ev=>{const date=(last&&last.date)||(runs[0]&&runs[0].date);if(!date){alert('Ejecuta primero un ciclo');return}
  ev.target.disabled=true;ev.target.innerHTML='<span class="spin"></span>…';
  try{const o=await api('/api/channels/'+encodeURIComponent(id)+'/regenerate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({date,reroll:true})});alert('Regenerado: '+(o.headline||o.status));location.reload()}
  catch(e){alert('Error: '+e.message);ev.target.disabled=false;ev.target.textContent='🎲 Regenerar (otro ángulo)'}};
 $('#runbtn').onclick=async ev=>{ev.target.disabled=true;ev.target.innerHTML='<span class="spin"></span> Ejecutando…';
  try{const o=await api('/api/channels/'+encodeURIComponent(id)+'/run',{method:'POST'});alert('Run '+o.status+' — '+(o.detail||''));location.reload()}
  catch(e){alert('Error: '+e.message);ev.target.disabled=false;ev.target.textContent='▶ Probar (dry-run)'}};
 document.querySelectorAll('[data-ap]').forEach(b=>b.onclick=async()=>{b.disabled=true;
  try{await api('/api/channels/'+encodeURIComponent(id)+'/approve',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({date:b.dataset.ap})});location.reload()}catch(e){alert('Error: '+e.message);b.disabled=false}});
 document.querySelectorAll('[data-rj]').forEach(b=>b.onclick=async()=>{if(!confirm('¿Descartar?'))return;
  try{await api('/api/channels/'+encodeURIComponent(id)+'/reject',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({date:b.dataset.rj})});location.reload()}catch(e){alert('Error: '+e.message)}});
}

const CW={topic:'',language:'es-ES',region:'ES',local:false,rec:null,hw:null};
async function viewCreate(){
 setActive('/create');
 try{CW.hw=await api('/api/hardware')}catch{}
 const hw=CW.hw;
 const canLocal=hw&&(hw.rec.image!=='cloud-only'||hw.rec.localLLM!=='cloud-only');
 const imgModel=hw?(hw.rec.image==='cloud-only'?null:hw.rec.image):null;
 if(hw&&CW.local===false&&CW.rec===null)CW.local=!!canLocal; // sugerencia inicial según equipo
 const hwHint=hw?(canLocal
   ? '<span class="chip ok"><span class=dot></span>Tu equipo puede con local ($0)</span> '+(imgModel?'<span class="chip"><span class=dot></span>imagen: '+imgModel+'</span>':'')
   : '<span class="chip warn"><span class=dot></span>Recomendado: nube (sin GPU potente)</span>')
   :'';
 app.innerHTML=\`
  <div class="h1">Crear un canal</div><p class="sub">Sin código. En 2 pasos: describe y confirma.</p>
  <div class="steps"><div class="s on" id="st1"></div><div class="s" id="st2"></div></div>
  <div class="card" id="step1">
   <label>¿De qué tratará tu canal?</label>
   <textarea id="topic" placeholder="Ej: curiosidades de la historia universal contadas en 1 minuto">\${esc(CW.topic)}</textarea>
   <p class="hint">Cuanto más concreto, mejor te guiamos.</p>
   <div class="row">
    <div style="flex:1"><label>Idioma</label><input id="lang" value="\${CW.language}"/></div>
    <div style="flex:1"><label>Región</label><input id="region" value="\${CW.region}"/></div>
   </div>
   <label>Calidad / coste</label>
   <label class="toggle"><input type="checkbox" id="local" \${CW.local?'checked':''}/> <span>Modo 100% local ($0) — Ollama + Kokoro + ComfyUI</span></label>
   <p class="hint">\${hwHint||'Sin marcar = nube (máxima calidad, de pago). Marcado = gratis, corre en tu equipo.'}</p>
   <div style="margin-top:18px"><button class="btn primary" id="analyze">Analizar temática →</button></div>
  </div>\`;
 $('#analyze').onclick=async()=>{
  CW.topic=$('#topic').value.trim();CW.language=$('#lang').value;CW.region=$('#region').value;CW.local=$('#local').checked;
  if(!CW.topic){alert('Escribe una temática');return}
  const b=$('#analyze');b.disabled=true;b.innerHTML='<span class="spin"></span> Analizando…';
  try{CW.rec=await api('/api/recommend?topic='+encodeURIComponent(CW.topic)+'&local='+CW.local);renderReco()}
  catch(e){alert('Error: '+e.message);b.disabled=false;b.textContent='Analizar temática →'}
 };
}
function renderReco(){
 const r=CW.rec;$('#st2').classList.add('on');
 const styleOpts=(r.styleOptions||[]).map(s=>'<option '+(s===r.style?'selected':'')+'>'+s+'</option>').join('');
 const vidOpts=['veo','sora','runway','comfyui'].map(s=>'<option '+(s===r.videoProvider?'selected':'')+'>'+s+'</option>').join('');
 const voiceOpts=(CW.local?['kokoro','piper']:['elevenlabs','openai','google']).map(s=>'<option '+(s===r.voiceProvider?'selected':'')+'>'+s+'</option>').join('');
 app.querySelector('#step1').outerHTML=\`
  <div class="card">
   <h3>Nuestra propuesta</h3>
   <p class="muted">\${esc(r.rationale)}</p>
   <div class="reco" style="margin:14px 0">
    <div class="item"><div class="l">Tipo</div><div class="v">\${esc(r.contentKind)}</div></div>
    <div class="item"><div class="l">Adapter (sin código)</div><div class="v">\${esc(r.adapter)}</div></div>
    <div class="item"><div class="l">Estilo visual</div><select id="r_style">\${styleOpts}</select></div>
    <div class="item"><div class="l">Modo vídeo</div><div class="v">\${esc(r.videoMode)}</div></div>
    \${r.videoMode!=='data_card'?'<div class="item"><div class="l">Modelo de vídeo</div><select id="r_vid">'+vidOpts+'</select></div>':''}
    <div class="item"><div class="l">Voz</div><select id="r_voice">\${voiceOpts}</select></div>
    \${CW.local&&CW.hw?'<div class="item"><div class="l">Imagen (local, según tu GPU)</div><div class="v">'+(CW.hw.rec.image==='cloud-only'?'⚠ tu GPU es justa → mejor nube':CW.hw.rec.image)+'</div></div>':''}
   </div>
   <p class="hint">\${esc(r.styleRationale||'')}</p>
   <div class="row" style="margin-top:8px">
    <button class="btn ghost" onclick="location.hash='#/create'">← Cambiar</button>
    <button class="btn primary" id="create">Crear canal ✓</button>
   </div>
  </div>\`;
 $('#create').onclick=async ev=>{
  ev.target.disabled=true;ev.target.innerHTML='<span class="spin"></span> Creando…';
  const body={topic:CW.topic,language:CW.language,region:CW.region,local:CW.local,
   style:$('#r_style').value,voiceProvider:$('#r_voice').value,videoProvider:$('#r_vid')?$('#r_vid').value:undefined};
  try{const o=await api('/api/channels',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
   location.hash='#/channel/'+encodeURIComponent(o.id)}
  catch(e){alert('Error: '+e.message);ev.target.disabled=false;ev.target.textContent='Crear canal ✓'}
 };
}

async function viewSetup(){
 setActive('/setup');let d={};try{d=await api('/api/doctor')}catch{}
 const line=(ok,name,detail)=>'<tr><td>'+name+'</td><td>'+(ok?'<span class="chip ok"><span class=dot></span>online</span>':'<span class="chip bad"><span class=dot></span>offline</span>')+'</td><td class=muted>'+detail+'</td></tr>';
 app.innerHTML=\`<div class="h1">Estado local</div><p class="sub">Servidores de IA gratuitos en tu máquina.</p>
  <div class="card"><table><thead><tr><th>Servicio</th><th>Estado</th><th></th></tr></thead><tbody>
   \${line(d.llm,'LLM (Ollama)',d.llmModel? ('modelo '+d.llmModel.name+(d.llmModel.present?' ✓':' — falta: ollama pull '+d.llmModel.name)) : ':11434')}
   \${line(d.tts,'Voz (Kokoro)',':8880')}
   \${line(d.comfyui,'ComfyUI (imagen/vídeo)',':8188')}
   \${line(d.ffmpeg,'ffmpeg','render real')}
  </tbody></table>
  <p class="hint" style="margin-top:14px">Levanta todo con <code>npm run setup:local</code> (o <code>setup:local:win</code> en Windows).</p>
  </div>\`;
}

async function viewLibrary(){
 setActive('/library');
 app.innerHTML='<div class="h1">Biblioteca</div><p class="sub">Busca en todo el contenido generado.</p>'+
  '<div class="card"><input id="q" placeholder="Buscar por titular, canal o fecha…"/><div id="res" style="margin-top:12px"></div></div>';
 const run=async()=>{
  const rows=await api('/api/library?q='+encodeURIComponent($('#q').value||''));
  $('#res').innerHTML='<table><thead><tr><th>Fecha</th><th>Canal</th><th>Titular</th><th></th></tr></thead><tbody>'+
   (rows.length?rows.map(r=>'<tr><td>'+esc(r.date)+'</td><td class=muted>'+esc(r.channelId)+'</td><td>'+esc(r.headline)+'</td><td>'+(r.classification?'<span class=pill>'+esc(r.classification)+'</span>':'')+'</td></tr>').join(''):'<tr><td colspan=4 class=muted>Sin resultados</td></tr>')+'</tbody></table>';
 };
 let t;$('#q').oninput=()=>{clearTimeout(t);t=setTimeout(run,250)};
 run();
}
async function viewCalendar(){
 setActive('/calendar');
 let ch=[];try{ch=await api('/api/channels')}catch{}
 app.innerHTML='<div class="h1">Calendario</div><p class="sub">Publicado y planificado por canal.</p>'+
  '<div class="card"><select id="cal">'+ch.map(c=>'<option>'+esc(c.id)+'</option>').join('')+'</select><div id="cal_body" style="margin-top:14px"></div></div>';
 const load=async id=>{
  const d=await api('/api/calendar?channel='+encodeURIComponent(id));
  const cls=s=>s==='completed'?'ok':s==='failed'?'bad':'warn';
  const pub=d.published.length?d.published.map(e=>'<span class="chip '+cls(e.status)+'" style="margin:3px"><span class=dot></span>'+esc(e.date)+'</span>').join(''):'<span class=muted>sin publicaciones</span>';
  const plan=d.planned.length?d.planned.map(p=>'<tr><td>'+(p.usedDate?'<span class="chip ok">'+esc(p.usedDate)+'</span>':'<span class=pill>pendiente</span>')+'</td><td>'+esc(p.angle)+'</td></tr>').join(''):'<tr><td colspan=2 class=muted>backlog vacío — añade ideas con: factory backlog '+esc(id)+' --add "…"</td></tr>';
  $('#cal_body').innerHTML='<h3>Publicado</h3><div class="row" style="flex-wrap:wrap">'+pub+'</div><h3 style="margin-top:16px">Planificado (backlog)</h3><table><tbody>'+plan+'</tbody></table>';
 };
 $('#cal').onchange=()=>load($('#cal').value);
 if(ch[0])load(ch[0].id);
}
function router(){
 const h=location.hash.replace('#','')||'/';
 if(h==='/')return viewHome();
 if(h==='/create')return viewCreate();
 if(h==='/channels')return viewChannels();
 if(h.startsWith('/channel/'))return viewChannel(decodeURIComponent(h.slice('/channel/'.length)));
 if(h==='/library')return viewLibrary();
 if(h==='/calendar')return viewCalendar();
 if(h==='/setup')return viewSetup();
 viewHome();
}
window.addEventListener('hashchange',router);
api('/api/health').then(h=>{if(h.tenant)$('#tenant').textContent=h.tenant}).catch(()=>{});
applyI18n();
router();
</script>
</body>
</html>`;
