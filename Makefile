# Channel Factory — convenience targets (Unix/macOS). Windows: use the npm scripts.
.PHONY: quickstart install verify test typecheck demo ui doctor setup-local stack stack-ai down

quickstart:   ## Todo automatizado + abre la UI (recomendado la 1ª vez)
	npm run quickstart

install:
	npm install

verify:       ## Smoke test offline
	npm run verify

test:
	npm test

typecheck:
	npm run typecheck

demo:         ## Ejecuta un ciclo del canal de ejemplo
	npm run demo

ui:           ## Abre la interfaz web
	npm run ui

doctor:       ## ¿Qué servidores locales / claves hay?
	npm run doctor

setup-local:  ## Levanta Ollama + Kokoro (Docker) y descarga modelo
	npm run setup:local

stack:        ## Stack 24/7 (worker + Postgres + Redis)
	docker compose up -d --build

stack-ai:     ## Stack 24/7 + IA local
	docker compose --profile ai up -d --build

down:
	docker compose down
