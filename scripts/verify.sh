#!/usr/bin/env bash
# Smoke check: builds nothing, just proves the pipeline runs offline end-to-end.
set -euo pipefail
cd "$(dirname "$0")/.."

fail(){ printf "\033[31m✗ %s\033[0m\n" "$*"; exit 1; }
pass(){ printf "\033[32m✓ %s\033[0m\n" "$*"; }

OUT="$(npm run -s factory -- run luz-es --date 2026-06-21 --dry-run 2>/dev/null || true)"
echo "$OUT" | grep -q "COMPLETED" && pass "pipeline completa (dry-run)" || fail "el ciclo no completó"

npm run -s factory -- validate luz-es >/dev/null 2>&1 && pass "validate luz-es OK" || fail "validate falló"
npm run -s factory -- validate luz-es-veo >/dev/null 2>&1 && pass "validate luz-es-veo OK" || fail "validate veo falló"
npm run -s factory -- adapters >/dev/null 2>&1 && pass "adapters registrados" || fail "adapters falló"
echo "Smoke OK."
