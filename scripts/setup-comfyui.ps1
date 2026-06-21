# Descarga el modelo de imagen para ComfyUI (SDXL base) y deja el workflow listo (Windows).
# La descarga (~6.9 GB) va al host (comfyui-models\) y ComfyUI la lee por bind-mount.
#
#   npm run setup:comfyui:win
param([string]$ModelsDir = "comfyui-models")
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$CkptDir = Join-Path $ModelsDir "checkpoints"
$File = Join-Path $CkptDir "sd_xl_base_1.0.safetensors"
$Url = "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors"

function Say($m){Write-Host "`n> $m" -ForegroundColor Cyan}
function Ok($m){Write-Host "  [ok] $m" -ForegroundColor Green}

Say "1/3  Preparando carpeta de modelos"
New-Item -ItemType Directory -Force -Path $CkptDir | Out-Null
Ok $CkptDir

Say "2/3  Descargando SDXL base (~6.9 GB)"
if((Test-Path $File) -and ((Get-Item $File).Length -gt 6000000000)){ Ok "ya descargado (omito)" }
else { curl.exe -L -C - -o $File $Url; Ok "modelo en $File" }

Say "3/3  ComfyUI"
if(Get-Command docker -ErrorAction SilentlyContinue){
  docker compose -f docker-compose.local.yml --profile gpu up -d comfyui 2>$null
  if($LASTEXITCODE -eq 0){ Ok "ComfyUI en :8188 (lee comfyui-models\ por bind-mount)" }
  else { Write-Host "  [!] No se pudo arrancar ComfyUI (sin GPU?). El modelo ya esta descargado." -ForegroundColor Yellow }
} else { Write-Host "  [!] Docker no encontrado. Modelo descargado en comfyui-models\." -ForegroundColor Yellow }

Write-Host "`n[OK] Listo. comfyui-workflows/sdxl-image.json ya usa este checkpoint." -ForegroundColor Green
