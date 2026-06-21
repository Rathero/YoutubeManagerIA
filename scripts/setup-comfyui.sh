#!/usr/bin/env bash
# Descarga el modelo de imagen para ComfyUI (SDXL base por defecto) y deja el workflow
# listo. La descarga (~6.9 GB) va al host (comfyui-models/) y ComfyUI la lee por bind-mount,
# así que NO necesitas GPU ni el contenedor arrancado para descargar. Reanudable.
#
#   npm run setup:comfyui
set -euo pipefail
cd "$(dirname "$0")/.."

MODELS_DIR="${COMFYUI_MODELS_DIR:-comfyui-models}"
CKPT_DIR="$MODELS_DIR/checkpoints"
FILE="$CKPT_DIR/sd_xl_base_1.0.safetensors"
URL="https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors"

say(){ printf "\n\033[1;36m▶ %s\033[0m\n" "$*"; }
ok(){ printf "  \033[32m✓\033[0m %s\n" "$*"; }

say "1/3  Preparando carpeta de modelos"
mkdir -p "$CKPT_DIR"
ok "$CKPT_DIR"

say "2/3  Descargando SDXL base (~6.9 GB, reanudable)"
if [ -f "$FILE" ] && [ "$(stat -c%s "$FILE" 2>/dev/null || stat -f%z "$FILE")" -gt 6000000000 ]; then
  ok "ya descargado (omito)"
elif command -v curl >/dev/null 2>&1; then
  curl -L -C - -o "$FILE" "$URL"
elif command -v wget >/dev/null 2>&1; then
  wget -c -O "$FILE" "$URL"
else
  echo "Necesito curl o wget para descargar."; exit 1
fi
ok "modelo en $FILE"

say "3/3  ComfyUI"
if command -v docker >/dev/null 2>&1; then
  if docker compose version >/dev/null 2>&1; then DC="docker compose"; else DC="docker-compose"; fi
  $DC -f docker-compose.local.yml --profile gpu up -d comfyui 2>/dev/null \
    && ok "ComfyUI arrancado en :8188 (lee comfyui-models/ por bind-mount)" \
    || printf "  \033[33m!\033[0m No se pudo arrancar ComfyUI (¿sin GPU?). El modelo ya está descargado;\n     arráncalo cuando puedas: docker compose -f docker-compose.local.yml --profile gpu up -d comfyui\n"
else
  printf "  \033[33m!\033[0m Docker no encontrado. El modelo está descargado en comfyui-models/.\n     Apunta tu ComfyUI a esa carpeta de checkpoints o instálalo con Docker.\n"
fi

printf "\n\033[1;32m✅ Listo.\033[0m El workflow comfyui-workflows/sdxl-image.json ya usa este checkpoint.\n"
printf "   En una config: image: { provider: comfyui, workflow: \"comfyui-workflows/sdxl-image.json\" }\n\n"
printf "   FLUX (mejor calidad, varios ficheros) es manual: ver comfyui-workflows/README.md\n\n"
