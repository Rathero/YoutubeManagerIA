# Super-easy local AI setup for Channel Factory on Windows (PowerShell). $0 inference.
# Brings up a local LLM (Ollama) + TTS (Kokoro) with Docker Desktop, pulls a model,
# wires .env, and runs the doctor. Safe to re-run.
#
#   npm run setup:local:win
#   powershell -ExecutionPolicy Bypass -File scripts/setup-local.ps1 -Model qwen3
param(
  [string]$Model = "llama3.2"
)
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$Compose = "docker-compose.local.yml"
$LlmUrl  = "http://localhost:11434/v1"
$TtsUrl  = "http://localhost:8880/v1"
$ComfyUrl = "http://localhost:8188"

function Say($m)  { Write-Host "`n$m" -ForegroundColor Cyan }
function Info($m) { Write-Host "  $m" }

# 1. .env
Say "1/4  Configurando .env"
if (-not (Test-Path ".env")) { Copy-Item ".env.example" ".env"; Info "creado .env desde .env.example" }

function Ensure-Env($key, $val) {
  $lines = Get-Content ".env"
  $found = $false
  $out = foreach ($line in $lines) {
    if ($line -match "^$key=") {
      $found = $true
      if ($line -match "^$key=$") { "$key=$val" } else { $line }
    } else { $line }
  }
  if (-not $found) { $out += "$key=$val" }
  Set-Content ".env" $out
}
Ensure-Env "FACTORY_LOCAL_LLM_URL" $LlmUrl
Ensure-Env "FACTORY_LOCAL_TTS_URL" $TtsUrl
Ensure-Env "FACTORY_COMFYUI_URL" $ComfyUrl
Ensure-Env "FACTORY_LOCAL_LLM_MODEL" $Model
Ensure-Env "FACTORY_LOCAL_LLM" "1"

# 2. Servers (Docker Desktop)
Say "2/4  Levantando servidores locales (Ollama + Kokoro)"
if (Get-Command docker -ErrorAction SilentlyContinue) {
  docker compose -f $Compose up -d ollama kokoro
  Info "contenedores arrancados (Ollama :11434, Kokoro :8880)"
} else {
  Info "Docker Desktop no encontrado. Instálalo desde https://www.docker.com/products/docker-desktop/"
  Info "o usa Ollama nativo para Windows: https://ollama.com/download"
}

# 3. Modelo LLM
Say "3/4  Descargando modelo LLM: $Model"
if (Get-Command docker -ErrorAction SilentlyContinue) {
  Info "esperando a Ollama..."
  for ($i = 0; $i -lt 30; $i++) {
    try { Invoke-WebRequest -UseBasicParsing "$LlmUrl/models" -TimeoutSec 2 | Out-Null; break } catch { Start-Sleep 2 }
  }
  try { docker compose -f $Compose exec -T ollama ollama pull $Model } catch { Info "descárgalo luego: ollama pull $Model" }
} elseif (Get-Command ollama -ErrorAction SilentlyContinue) {
  ollama pull $Model
} else {
  Info "Ollama no disponible aún; cuando lo tengas:  ollama pull $Model"
}

# 4. ComfyUI (opcional)
Say "4/4  ComfyUI (imagen/video) - opcional, requiere GPU"
Info "Levanta cuando quieras:  docker compose -f $Compose --profile gpu up -d comfyui"

Say "Diagnostico"
try { npm run -s doctor } catch { }

Say "Listo  Crea un canal 100% local:"
Info 'npm run factory -- create --topic "curiosidades de la historia" --local'
