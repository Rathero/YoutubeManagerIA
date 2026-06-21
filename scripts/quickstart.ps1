# Channel Factory - quickstart for Windows (PowerShell). Automates local testing:
# checks Node, installs deps, creates .env, verifies, runs the offline demo, and opens
# the web UI. No API keys needed - runs in $0 demo mode.
#
#   npm run quickstart:win
#   powershell -ExecutionPolicy Bypass -File scripts/quickstart.ps1 -Port 8787
param([int]$Port = 8787, [switch]$SkipTests, [switch]$Local)
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

function Say($m){Write-Host "`n> $m" -ForegroundColor Cyan}
function Ok($m){Write-Host "  [ok] $m" -ForegroundColor Green}
function Warn($m){Write-Host "  [!] $m" -ForegroundColor Yellow}

Say "1/7  Comprobando Node.js (>=20)"
if(-not (Get-Command node -ErrorAction SilentlyContinue)){throw "Node.js no encontrado. Instala Node 20+ desde https://nodejs.org"}
$major=[int](node -p "process.versions.node.split('.')[0]")
if($major -lt 20){throw "Necesitas Node >= 20 (tienes $(node -v))"}
Ok "node $(node -v)"
if(Get-Command ffmpeg -ErrorAction SilentlyContinue){Ok "ffmpeg presente"}else{Warn "ffmpeg ausente -> render como manifest (winget install Gyan.FFmpeg)"}

Say "2/7  Instalando dependencias"
if(Test-Path package-lock.json){npm ci 2>$null; if($LASTEXITCODE -ne 0){npm install 2>$null}}else{npm install 2>$null}
Ok "dependencias instaladas"

Say "3/7  Preparando .env"
if(Test-Path .env){Ok ".env ya existe"}else{Copy-Item .env.example .env; Ok ".env creado (todo opcional)"}

Say "4/7  Verificando (typecheck + tests)"
if($SkipTests){Warn "saltado"}else{ npm run -s typecheck; Ok "typecheck OK"; npm run -s test *> $null; if($LASTEXITCODE -eq 0){Ok "tests OK"}else{Warn "algun test fallo (npm test)"} }

if($Local){
  Say "4b   Instalando IA local (Ollama + Kokoro)"
  if(Get-Command docker -ErrorAction SilentlyContinue){ powershell -ExecutionPolicy Bypass -File scripts/setup-local.ps1; Ok "IA local lista (texto + voz). ComfyUI: opcional (GPU)." }
  else { Warn "Docker no encontrado -> instala Docker Desktop y reejecuta con -Local" }
} else { Warn "IA local NO instalada (modo demo). Para montarla: 'npm run quickstart:win -- -Local' o 'npm run setup:local:win'." }

Say "5/7  Demo offline: ciclo del canal de ejemplo (luz-es)"
npm run -s factory -- validate luz-es | Out-Null; Ok "config valida"
npm run -s factory -- run luz-es --date 2026-06-21 *> $null; Ok "ciclo ejecutado -> out/luz-es/2026-06-21/"

Say "6/7  Datos de ejemplo -> feedback"
npm run -s factory -- metrics:sample luz-es *> $null; Ok "metricas demo escritas"
npm run -s factory -- feedback luz-es 2>$null | ForEach-Object { "   $_" }

Say "7/7  Estado y UI"
npm run -s factory -- doctor 2>$null | ForEach-Object { "   $_" }
Write-Host "`n[OK] Listo. Abriendo http://localhost:$Port" -ForegroundColor Green
npm run -s factory -- dashboard --port $Port --open
