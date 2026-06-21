#!/usr/bin/env bash
# Provisiona una VM Ubuntu limpia (Hetzner / Oracle / cualquier proveedor) y deja el
# stack Channel Factory corriendo 24/7 (worker + Postgres + Redis + Dashboard).
# Idempotente. Ejecútalo como root o con sudo, DENTRO del repo clonado (o pon REPO=...).
#
#   # opción 1: ya has clonado el repo
#   sudo bash scripts/deploy-vm.sh                 # solo CPU (IA por API o externa)
#   sudo bash scripts/deploy-vm.sh --ai            # + Ollama + Kokoro locales
#   sudo bash scripts/deploy-vm.sh --ai --gpu      # + ComfyUI (necesita GPU NVIDIA)
#
#   # opción 2: clonar automáticamente (repo privado → incluye token en la URL)
#   REPO="https://<token>@github.com/rathero/youtubemanageria.git" \
#     bash scripts/deploy-vm.sh
set -euo pipefail

say(){ printf "\n\033[1;36m▶ %s\033[0m\n" "$*"; }
ok(){ printf "  \033[32m✓\033[0m %s\n" "$*"; }

SUDO=""; [ "$(id -u)" -ne 0 ] && SUDO="sudo"

# 1. Paquetes base + Docker
say "1/6  Instalando Docker, git, ffmpeg"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | $SUDO sh
fi
$SUDO apt-get update -y >/dev/null 2>&1 || true
$SUDO apt-get install -y git ffmpeg curl >/dev/null 2>&1 || true
ok "docker $(docker --version | awk '{print $3}' | tr -d ,)"

# 2. Repo
say "2/6  Código"
if [ ! -f package.json ]; then
  [ -z "${REPO:-}" ] && { echo "No estás en el repo y no diste REPO=... (URL git con token)"; exit 1; }
  git clone "$REPO" channel-factory
  cd channel-factory
fi
ok "repo en $(pwd)"

# 3. .env (+ token de dashboard generado)
say "3/6  Configuración (.env)"
[ -f .env ] || cp .env.example .env
if ! grep -qE "^FACTORY_DASHBOARD_TOKEN=.+" .env; then
  TOKEN=$(openssl rand -hex 16 2>/dev/null || date +%s%N | sha256sum | cut -c1-32)
  if grep -qE "^FACTORY_DASHBOARD_TOKEN=" .env; then
    sed -i "s|^FACTORY_DASHBOARD_TOKEN=.*|FACTORY_DASHBOARD_TOKEN=$TOKEN|" .env
  else echo "FACTORY_DASHBOARD_TOKEN=$TOKEN" >> .env; fi
fi
TOKEN=$(grep -E "^FACTORY_DASHBOARD_TOKEN=" .env | cut -d= -f2-)
ok "token de UI generado (protege el panel)"

# 4. Perfiles
PROFILES=""
for a in "$@"; do
  [ "$a" = "--ai" ]  && PROFILES="$PROFILES --profile ai"
  [ "$a" = "--gpu" ] && PROFILES="$PROFILES --profile gpu"
done

# 5. Arrancar
say "4/6  Construyendo y levantando el stack$([ -n "$PROFILES" ] && echo " ($PROFILES)")"
DC="docker compose"; docker compose version >/dev/null 2>&1 || DC="docker-compose"
$SUDO $DC $PROFILES up -d --build
ok "contenedores arriba"

# 6. Modelo de Ollama si --ai
for a in "$@"; do
  if [ "$a" = "--ai" ]; then
    say "5/6  Descargando modelo de Ollama"
    sleep 8
    $SUDO $DC exec -T ollama ollama pull "${FACTORY_LOCAL_LLM_MODEL:-llama3.2}" 2>/dev/null && ok "modelo listo" || echo "  (descárgalo luego: docker compose exec ollama ollama pull llama3.2)"
  fi
done

say "6/6  Listo"
IP=$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
printf "\n\033[1;32m✅ Stack en marcha.\033[0m\n"
printf "   Panel:   http://%s:8787/?token=%s\n" "$IP" "$TOKEN"
printf "   (abre esa URL UNA vez; el token queda recordado en el navegador)\n\n"
printf "   Abre el puerto 8787 en el firewall del proveedor si no llegas.\n"
printf "   Logs:    docker compose logs -f worker\n"
printf "   Parar:   docker compose down\n\n"
