#!/usr/bin/env bash
# Descarga el mejor modelo de imagen para ComfyUI según tu GPU y deja el workflow listo.
# Modelos (single-file, sin token de HuggingFace):
#   sdxl          → SDXL base (~6.9GB)         · compatible con casi todo, 8GB VRAM
#   flux-schnell  → FLUX.1 schnell fp8 (~17GB)  · MEJOR calidad, Apache (uso comercial), 12GB VRAM
#   auto (def)    → elige según la VRAM detectada
#
#   npm run setup:comfyui                 # auto
#   npm run setup:comfyui -- flux-schnell # forzar FLUX
set -euo pipefail
cd "$(dirname "$0")/.."

MODELS_DIR="${COMFYUI_MODELS_DIR:-comfyui-models}"
CKPT_DIR="$MODELS_DIR/checkpoints"
CHOICE="${1:-${MODEL:-auto}}"

say(){ printf "\n\033[1;36m▶ %s\033[0m\n" "$*"; }
ok(){ printf "  \033[32m✓\033[0m %s\n" "$*"; }
warn(){ printf "  \033[33m!\033[0m %s\n" "$*"; }

# Detect VRAM (MB) via nvidia-smi when available.
VRAM=0
if command -v nvidia-smi >/dev/null 2>&1; then
  VRAM=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null | head -1 | tr -d ' ' || echo 0)
fi

if [ "$CHOICE" = "auto" ]; then
  if [ "${VRAM:-0}" -ge 12000 ]; then CHOICE="flux-schnell"; else CHOICE="sdxl"; fi
  say "Autodetección: VRAM=${VRAM}MB → modelo: $CHOICE"
fi

case "$CHOICE" in
  flux-schnell|flux)
    URL="https://huggingface.co/Comfy-Org/flux1-schnell/resolve/main/flux1-schnell-fp8.safetensors"
    FILE="$CKPT_DIR/flux1-schnell-fp8.safetensors"; MINSZ=15000000000; WF="flux-schnell-image.json";;
  sdxl)
    URL="https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors"
    FILE="$CKPT_DIR/sd_xl_base_1.0.safetensors"; MINSZ=6000000000; WF="sdxl-image.json";;
  *) echo "Modelo desconocido: $CHOICE (usa sdxl | flux-schnell | auto)"; exit 1;;
esac

[ "${VRAM:-0}" -gt 0 ] && [ "${VRAM:-0}" -lt 8000 ] && warn "VRAM baja (${VRAM}MB): la generación de imagen irá lenta. Considera usar la nube."
[ "${VRAM:-0}" -eq 0 ] && warn "Sin GPU NVIDIA detectada: ComfyUI irá MUY lento en CPU. (Mac Apple Silicon usa Metal.)"

say "1/3  Carpeta de modelos"
mkdir -p "$CKPT_DIR"; ok "$CKPT_DIR"

say "2/3  Descargando $CHOICE (reanudable)"
if [ -f "$FILE" ] && [ "$(stat -c%s "$FILE" 2>/dev/null || stat -f%z "$FILE" 2>/dev/null || echo 0)" -gt "$MINSZ" ]; then
  ok "ya descargado (omito)"
elif command -v curl >/dev/null 2>&1; then curl -L -C - -o "$FILE" "$URL"
elif command -v wget >/dev/null 2>&1; then wget -c -O "$FILE" "$URL"
else echo "Necesito curl o wget."; exit 1; fi
ok "modelo en $FILE"

say "3/3  ComfyUI"
if command -v docker >/dev/null 2>&1; then
  DC="docker compose"; docker compose version >/dev/null 2>&1 || DC="docker-compose"
  $DC -f docker-compose.local.yml --profile gpu up -d comfyui 2>/dev/null \
    && ok "ComfyUI en :8188 (lee $MODELS_DIR/ por bind-mount)" \
    || warn "No se pudo arrancar ComfyUI (¿sin GPU?). El modelo ya está descargado."
else
  warn "Docker no encontrado. Modelo descargado en $MODELS_DIR/."
fi

printf "\n\033[1;32m✅ Listo.\033[0m  Usa en tu config:\n"
printf "   image: { provider: comfyui, workflow: \"comfyui-workflows/%s\" }\n\n" "$WF"
