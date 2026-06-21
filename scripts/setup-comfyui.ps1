# Descarga el mejor modelo de imagen para ComfyUI (Windows). sdxl | flux-schnell | auto.
#   npm run setup:comfyui:win
#   powershell -File scripts/setup-comfyui.ps1 -Model flux-schnell
param([string]$Model = "auto", [string]$ModelsDir = "comfyui-models")
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
$CkptDir = Join-Path $ModelsDir "checkpoints"

function Say($m){Write-Host "`n> $m" -ForegroundColor Cyan}
function Ok($m){Write-Host "  [ok] $m" -ForegroundColor Green}
function Warn($m){Write-Host "  [!] $m" -ForegroundColor Yellow}

$vram = 0
if(Get-Command nvidia-smi -ErrorAction SilentlyContinue){
  try { $vram = [int](nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | Select-Object -First 1) } catch {}
}
if($Model -eq "auto"){ if($vram -ge 12000){$Model="flux-schnell"}else{$Model="sdxl"}; Say "Autodeteccion: VRAM=${vram}MB -> $Model" }

switch($Model){
 "flux-schnell" { $Url="https://huggingface.co/Comfy-Org/flux1-schnell/resolve/main/flux1-schnell-fp8.safetensors"; $File=Join-Path $CkptDir "flux1-schnell-fp8.safetensors"; $Min=15000000000; $Wf="flux-schnell-image.json" }
 "flux"         { $Url="https://huggingface.co/Comfy-Org/flux1-schnell/resolve/main/flux1-schnell-fp8.safetensors"; $File=Join-Path $CkptDir "flux1-schnell-fp8.safetensors"; $Min=15000000000; $Wf="flux-schnell-image.json" }
 "flux-dev"     { $Url="https://huggingface.co/Comfy-Org/flux1-dev/resolve/main/flux1-dev-fp8.safetensors"; $File=Join-Path $CkptDir "flux1-dev-fp8.safetensors"; $Min=15000000000; $Wf="flux-dev-image.json"; Warn "FLUX.1 dev = NO COMERCIAL. Para monetizar usa flux-schnell." }
 default        { $Url="https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors"; $File=Join-Path $CkptDir "sd_xl_base_1.0.safetensors"; $Min=6000000000; $Wf="sdxl-image.json" }
}
if($vram -gt 0 -and $vram -lt 8000){ Warn "VRAM baja (${vram}MB): imagen lenta. Considera la nube." }
if($vram -eq 0){ Warn "Sin GPU NVIDIA: ComfyUI muy lento en CPU." }

Say "1/3  Carpeta de modelos"; New-Item -ItemType Directory -Force -Path $CkptDir | Out-Null; Ok $CkptDir
Say "2/3  Descargando $Model (reanudable)"
if((Test-Path $File) -and ((Get-Item $File).Length -gt $Min)){ Ok "ya descargado" } else { curl.exe -L -C - -o $File $Url; Ok "modelo en $File" }
Say "3/3  ComfyUI"
if(Get-Command docker -ErrorAction SilentlyContinue){ docker compose -f docker-compose.local.yml --profile gpu up -d comfyui 2>$null; if($LASTEXITCODE -eq 0){Ok "ComfyUI en :8188"}else{Warn "No arrancó (sin GPU?). Modelo ya descargado."} } else { Warn "Docker no encontrado." }
Write-Host "`n[OK] Usa: image: { provider: comfyui, workflow: `"comfyui-workflows/$Wf`" }" -ForegroundColor Green
