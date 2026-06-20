#!/usr/bin/env bash
# Super-easy local AI setup for Channel Factory ($0 inference).
# Brings up a local LLM (Ollama) + TTS (Kokoro), pulls a model, wires .env, and
# runs the doctor. Safe to re-run. ComfyUI (image/video) is optional/GPU — see notes.
#
#   npm run setup:local            # uses default model
#   npm run setup:local -- qwen3   # choose a model
set -euo pipefail
cd "$(dirname "$0")/.."

MODEL="${1:-llama3.2}"
COMPOSE="docker-compose.local.yml"
LLM_URL="http://localhost:11434/v1"
TTS_URL="http://localhost:8880/v1"
COMFY_URL="http://localhost:8188"

say()  { printf "\n\033[1m%s\033[0m\n" "$*"; }
info() { printf "  %s\n" "$*"; }

# ── 1. .env ──────────────────────────────────────────────────────────────────────
say "1/4  Configurando .env"
[ -f .env ] || { cp .env.example .env; info "creado .env desde .env.example"; }

ensure_env() { # key value
  local key="$1" val="$2"
  if grep -qE "^${key}=" .env; then
    # Update only if currently empty.
    if grep -qE "^${key}=$" .env; then
      sed -i.bak "s|^${key}=$|${key}=${val}|" .env && rm -f .env.bak
      info "set ${key}=${val}"
    fi
  else
    printf "%s=%s\n" "$key" "$val" >> .env
    info "añadido ${key}=${val}"
  fi
}
ensure_env FACTORY_LOCAL_LLM_URL "$LLM_URL"
ensure_env FACTORY_LOCAL_TTS_URL "$TTS_URL"
ensure_env FACTORY_COMFYUI_URL "$COMFY_URL"
ensure_env FACTORY_LOCAL_LLM_MODEL "$MODEL"
ensure_env FACTORY_LOCAL_LLM 1

# ── 2. Servers (Docker) ──────────────────────────────────────────────────────────
say "2/4  Levantando servidores locales (Ollama + Kokoro)"
if command -v docker >/dev/null 2>&1; then
  if docker compose version >/dev/null 2>&1; then DC="docker compose"; else DC="docker-compose"; fi
  $DC -f "$COMPOSE" up -d ollama kokoro
  info "contenedores arrancados (Ollama :11434, Kokoro :8880)"
else
  info "Docker no encontrado. Opciones:"
  info "  • Ollama nativo:  curl -fsSL https://ollama.com/install.sh | sh   (luego: ollama serve)"
  info "  • Kokoro TTS:     docker run -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-cpu:latest"
  info "Continúo sin levantar contenedores."
fi

# ── 3. Modelo LLM ────────────────────────────────────────────────────────────────
say "3/4  Descargando modelo LLM: $MODEL"
if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' | grep -q '^cf-ollama$'; then
  info "esperando a Ollama…"
  for i in $(seq 1 30); do
    curl -fsS "$LLM_URL/models" >/dev/null 2>&1 && break || sleep 2
  done
  ${DC:-docker compose} -f "$COMPOSE" exec -T ollama ollama pull "$MODEL" || info "no se pudo descargar (hazlo luego: ollama pull $MODEL)"
elif command -v ollama >/dev/null 2>&1; then
  ollama pull "$MODEL" || true
else
  info "Ollama no disponible aún; descarga el modelo cuando lo tengas:  ollama pull $MODEL"
fi

# ── 4. ComfyUI (opcional, imagen/vídeo) ──────────────────────────────────────────
say "4/4  ComfyUI (imagen/vídeo) — opcional, requiere GPU"
info "Levanta cuando quieras:  docker compose -f $COMPOSE --profile gpu up -d comfyui"
info "Workflows editables en comfyui-workflows/ (FLUX/SDXL, Wan/LTX/Hunyuan)."

say "Diagnóstico"
npm run -s doctor || true

say "Listo ✅  Crea un canal 100% local:"
info "npm run factory -- create --topic \"curiosidades de la historia\" --local"
