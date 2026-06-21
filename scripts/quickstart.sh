#!/usr/bin/env bash
# Channel Factory — quickstart. Does EVERYTHING that can be automated for local testing:
# checks Node, installs deps, creates .env, builds, runs the offline demo, generates
# sample metrics, and opens the web UI. No API keys needed — runs in $0 demo mode.
#
#   npm run quickstart            # full
#   SKIP_TESTS=1 npm run quickstart
set -euo pipefail
cd "$(dirname "$0")/.."

say()  { printf "\n\033[1;36m▶ %s\033[0m\n" "$*"; }
ok()   { printf "  \033[32m✓\033[0m %s\n" "$*"; }
warn() { printf "  \033[33m!\033[0m %s\n" "$*"; }

# 1. Node
say "1/7  Comprobando Node.js (>=20)"
if ! command -v node >/dev/null 2>&1; then echo "Node.js no encontrado. Instala Node 20+ desde https://nodejs.org"; exit 1; fi
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
[ "$NODE_MAJOR" -ge 20 ] && ok "node $(node -v)" || { echo "Necesitas Node >= 20 (tienes $(node -v))"; exit 1; }
command -v ffmpeg >/dev/null 2>&1 && ok "ffmpeg presente (render real)" || warn "ffmpeg ausente → render como manifest (instálalo para vídeo real)"

# 2. Dependencies
say "2/7  Instalando dependencias"
if [ -f package-lock.json ]; then npm ci >/dev/null 2>&1 || npm install >/dev/null 2>&1; else npm install >/dev/null 2>&1; fi
ok "dependencias instaladas"

# 3. .env
say "3/7  Preparando .env"
[ -f .env ] && ok ".env ya existe" || { cp .env.example .env; ok ".env creado desde .env.example (todo opcional)"; }

# 4. Typecheck + tests
say "4/7  Verificando el proyecto (typecheck + tests)"
if [ "${SKIP_TESTS:-0}" = "1" ]; then warn "saltado (SKIP_TESTS=1)"; else
  npm run -s typecheck && ok "typecheck OK"
  npm run -s test >/dev/null 2>&1 && ok "tests OK" || warn "algún test falló (revisa con: npm test)"
fi

# 5. Offline demo (no keys, $0)
say "5/7  Demo offline: generando un ciclo del canal de ejemplo (luz-es)"
npm run -s factory -- validate luz-es >/dev/null && ok "config válida"
npm run -s factory -- run luz-es --date 2026-06-21 >/dev/null 2>&1 && ok "ciclo ejecutado → out/luz-es/2026-06-21/"
ls out/luz-es/2026-06-21/queue/*.json >/dev/null 2>&1 && ok "bundles de publicación '1-toque' creados (queue/)"
ls out/luz-es/2026-06-21/captions/*.srt >/dev/null 2>&1 && ok "subtítulos .srt generados"

# 6. Sample metrics → feedback + experiments
say "6/7  Datos de ejemplo → feedback y experimentos"
npm run -s factory -- metrics:sample luz-es >/dev/null 2>&1 && ok "métricas de demo escritas"
echo "   --- feedback ---"; npm run -s factory -- feedback luz-es 2>/dev/null | sed 's/^/   /' | tail -n +2 || true

# 7. Estado + UI
say "7/7  Estado de proveedores y arranque de la UI"
npm run -s factory -- doctor 2>/dev/null | sed 's/^/   /' || true
PORT="${PORT:-8787}"
printf "\n\033[1;32m✅ Listo.\033[0m  Abriendo la interfaz en http://localhost:%s\n" "$PORT"
printf "   En la UI: 'Crear canal' (asistente sin código) · 'Canales' (probar dry-run) · 'Estado local'.\n\n"
exec npm run -s factory -- dashboard --port "$PORT" --open
