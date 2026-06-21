# Probar Channel Factory en local

## TL;DR — un solo comando

```bash
npm run quickstart        # macOS/Linux  (Windows: npm run quickstart:win)
```

Eso **lo automatiza casi todo** y al final te abre la interfaz web. No necesitas ninguna
clave ni servicio: corre en **modo demo ($0)**. Lo único que tienes que tener antes es
**Node.js 20+**.

---

## Lo que hace el quickstart por ti (automático)

1. Comprueba Node 20+ (y avisa si falta ffmpeg).
2. Instala dependencias (`npm ci`/`install`).
3. Crea `.env` desde `.env.example` (todo opcional).
4. Typecheck + tests.
5. Ejecuta un **ciclo completo** del canal de ejemplo `luz-es` → genera guion, voz (stub),
   vídeo (manifest/ffmpeg), subtítulos `.srt`, miniatura y bundles de publicación en `out/`.
6. Crea métricas de ejemplo y te muestra **feedback** y **experimentos**.
7. Muestra el **doctor** (qué servidores/claves hay) y abre la **UI** en
   http://localhost:8787.

En la UI: **Crear canal** (asistente sin código) · **Canales** (botón "Probar dry-run") ·
**Estado local**.

Otros comandos útiles:

```bash
npm run verify     # smoke test offline (¿corre el pipeline?)
npm run demo       # un ciclo del canal de ejemplo
npm run ui         # solo la interfaz web
npm run doctor     # estado de proveedores locales / claves
make quickstart    # equivalente con make (Unix)
```

---

## Tu checklist manual (lo único que NO puedo automatizar)

### ✅ Obligatorio (para el modo demo)
- [ ] Instalar **Node.js 20+** → https://nodejs.org

### 🎬 Para ver **vídeo real** (no manifest)
- [ ] Instalar **ffmpeg** y dejarlo en el PATH
  - macOS: `brew install ffmpeg` · Windows: `winget install Gyan.FFmpeg` · Linux: `apt install ffmpeg`

### 🆓 Para IA **local gratis** ($0) — opcional
- [ ] Instalar **Docker Desktop** → https://www.docker.com/products/docker-desktop/
- [ ] Ejecutar `npm run setup:local` (o `setup:local:win`) → levanta Ollama + Kokoro y descarga el modelo
- [ ] (Opcional, GPU) **ComfyUI** para imagen/vídeo → `docker compose -f docker-compose.local.yml --profile gpu up -d`
- [ ] Comprobar con `npm run doctor` (te dice si falta el modelo: `ollama pull <modelo>`)

### ☁️ Para IA **cloud** (mejor calidad) — opcional
Pega las claves que quieras en `.env` (todas opcionales; sin ellas cae a stub/local):

| Quiero… | Variable(s) en `.env` | Dónde se saca |
|---|---|---|
| Guion/metadata con IA | `ANTHROPIC_API_KEY` o `OPENAI_API_KEY` o `GEMINI_API_KEY` | consola del proveedor |
| Voz ultra-realista | `ELEVENLABS_API_KEY` (+ `voice_id` en la config) | elevenlabs.io |
| Vídeo IA | `GEMINI_API_KEY` (Veo) · `OPENAI_API_KEY` (Sora) · `RUNWAY_API_KEY` | cada proveedor |
| Imágenes (cloud) | `OPENAI_API_KEY` (gpt-image-1) | platform.openai.com |
| B-roll de stock gratis | `PEXELS_API_KEY` o `PIXABAY_API_KEY` | pexels.com/api · pixabay.com/api |

> Tras editar `.env`, vuelve a lanzar `npm run doctor` para confirmar qué se usará.

### 📤 Para **publicar de verdad** — opcional
- [ ] **YouTube**: conseguir un OAuth access token con scope `youtube.upload` → `FACTORY_YT_ACCESS_TOKEN`
  (sin él, el sistema deja el MP4 + texto listos en `out/.../queue/` para subir en 1 toque)
- [ ] **TikTok/Instagram**: requieren app aprobada; por defecto van a la cola *assisted* (manual)
- [ ] **X / Bluesky / LinkedIn**: `X_ACCESS_TOKEN` · `BLUESKY_HANDLE`+`BLUESKY_APP_PASSWORD` · `LINKEDIN_ACCESS_TOKEN`+`LINKEDIN_AUTHOR_URN`
- [ ] **Newsletter/Telegram/Alertas**: `BUTTONDOWN_API_KEY` · `TELEGRAM_BOT_TOKEN`+`TELEGRAM_CHAT_ID` · `DISCORD_WEBHOOK_URL`

### 🏭 Para operación **24/7** — opcional
- [ ] `docker compose up -d --build` (worker + Postgres + Redis) · `+ --profile ai` para IA local
- [ ] Elegir canales: `FACTORY_CHANNELS="luz-es historia-local" docker compose up -d`

---

## Qué esperar en cada nivel

| Nivel | Qué pones tú | Qué obtienes |
|---|---|---|
| **0 — Demo** | nada (solo Node) | pipeline completo, UI, subtítulos, miniaturas, bundles "1-toque" (vídeo = manifest sin ffmpeg) |
| **0.5 — +ffmpeg** | ffmpeg | MP4 reales (data-card) con subtítulos y miniatura |
| **1 — Local $0** | Docker + `setup:local` | guion (Ollama), voz (Kokoro), imagen/vídeo (ComfyUI) — coste 0€ |
| **2 — Cloud** | claves en `.env` | máxima calidad (Claude/GPT, ElevenLabs, Veo/Sora/Runway) |
| **3 — Publicar** | tokens OAuth | subida automática (YouTube) / colas listas (resto) |
| **4 — 24/7** | Docker compose | worker programando y publicando solo |

---

## Solución de problemas

- **"render como manifest"** → instala ffmpeg.
- **doctor: modelo NO descargado** → `ollama pull <modelo>` (o `docker compose -f docker-compose.local.yml exec ollama ollama pull <modelo>`).
- **El puerto 8787 está ocupado** → `npm run ui -- --port 9000` o `PORT=9000 npm run quickstart`.
- **Windows + PowerShell bloquea scripts** → usa `npm run quickstart:win` (ya incluye `-ExecutionPolicy Bypass`).
- **Quiero empezar de cero** → borra la carpeta `out/`.
