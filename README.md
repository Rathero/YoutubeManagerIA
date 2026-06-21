# Channel Factory

Sistema **agnóstico** para crear y operar canales *faceless* automatizados en YouTube,
TikTok e Instagram. Dada la definición de un nicho, el sistema lo analiza, genera
contenido a partir de datos deterministas, lo renderiza y lo distribuye en todas las
plataformas. El canal de la luz (PVPC) es la **primera instancia**; el motor es genérico.

> **Principio rector:** el motor es universal; lo que cambia entre canales es la
> **config** (`ChannelDefinition`) + un **adapter** de datos. Añadir un canal nuevo no
> requiere tocar el núcleo.

---

## Arquitectura en dos fases

```
idea → [FASE A: GENESIS] → ChannelDefinition (draft) + informe + viability
                                   │ (gate humano → active)
                                   ▼
trigger → [FASE B: ENGINE]  ingest → compute → script → voice → render →
                            metadata → qa → publish(YT/TikTok/IG) → record
                                   │ métricas
                                   ▼
                            [FEEDBACK]  horarios · hooks · A/B
```

- **Genesis** (1x por canal, supervisada): convierte un `topic` en una `ChannelDefinition`
  + informe de estrategia + *viability score* (el **foso de datos** pesa más que nada).
- **Engine** (en bucle): pipeline genérico de producción y distribución que lee una
  `ChannelDefinition` y no sabe nada del nicho concreto.

### El contrato agnóstico: `ContentPayload`

Es el "idioma común" adapter → engine. Todo nicho produce esta forma; el engine
renderiza esta forma (`hook → tarjetas → cuerpo → gráfico → recomendación → CTA`).
Ver `src/core/types/content-payload.ts`.

### Crear un canal SIN código (onboarding guiado)

No hace falta programar nada. Describe la temática y el sistema te **guía** hasta el
enfoque, el **modelo de vídeo** y el **estilo**, y escribe una config ejecutable:

```bash
npm run factory -- create --topic "mitología nórdica: dioses y leyendas"
# (interactivo: propone tipo de contenido, estilo, modelo de vídeo, voz, formatos…
#  pulsa Enter para aceptar cada recomendación o escribe otra opción)

npm run factory -- create --topic "precio del gasóleo en España" --yes   # acepta todo
```

El sistema detecta si el nicho es de **datos**, **conocimiento** o **historia**, elige el
adapter declarativo adecuado, recomienda estilo+modelo según la temática (p.ej. historia →
*cinematic* + Veo; anime → *anime*; datos → *data_card*), y deja la config en `src/config/`.
A partir de ahí entra directa en la pipeline: `factory run <id> --dry-run`.

### Adapters: declarativos (sin código) o programados

El adapter produce el `ContentPayload`. Hay dos **declarativos** (cero código) y el
contrato sigue abierto para casos a medida (`src/adapters/_interface.ts`):

| Adapter | Para qué | Config |
|---------|----------|--------|
| **`generative`** | cualquier tema sin fuente de datos (historia, curiosidades, motivación…) | el LLM crea el contenido del día desde `niche.topic`; rota ángulos por fecha |
| **`http`** | nichos de datos con un feed JSON | `url` + `y_field` + mapeo; calcula min/max/media y construye el payload |
| **`luz`** (código) | ejemplo trabajado (PVPC) | adapter TypeScript a medida |

**El LLM redacta, no inventa** en nichos de datos (las cifras salen de `analyze()`
determinista). En nichos `story`/`knowledge` el contenido lo autoría el LLM y se etiqueta
como generado por IA; el QA gate ajusta su exigencia según `niche.content_kind`.

---

## Estructura

```
src/
├── core/            contratos, tipos (ChannelDefinition, ContentPayload, RunContext),
│                    orquestador genérico y definición de etapas
├── adapters/        un módulo por nicho (plugins). luz/ = primer adapter (PVPC)
├── engine/          etapas genéricas: ingest, compute, script, voice, render,
│                    metadata, qa, publish, record + cliente LLM swappable
├── distribution/    publishers por plataforma (youtube/tiktok/instagram) + cola "assisted"
├── genesis/         FASE A: análisis + generación de config + viability
├── scheduling/      trigger con data-gate (time_with_data_gate / pure_cron / event)
├── storage/         estado (JSON store; swappable a Postgres) + rutas de media
├── analytics/       pull de métricas + feedback (interfaces)
├── config/          channel definitions (luz-es.yaml) + loader + validate
├── templates/       prompt templates de guión por canal
└── ops/             CLI + logger
```

---

## Uso

```bash
npm install

# Listar adapters registrados
npm run factory -- adapters

# Validar una channel definition (el gate antes de pasar a 'active')
npm run factory -- validate luz-es

# Ejecutar un ciclo de producción (offline, usando el fixture incluido)
npm run factory -- run luz-es --date 2026-06-21 --dry-run   # no publica
npm run factory -- run luz-es --date 2026-06-21             # deja bundles "1-toque"

# Stack local gratis: setup en 1 comando + diagnóstico
npm run setup:local
npm run doctor

# Crear un canal SIN código (guiado): describe la temática y te lleva al modelo+estilo
npm run factory -- create --topic "curiosidades del espacio"
npm run factory -- create --topic "documentales de naturaleza" --local   # stack 100% local $0
npm run factory -- create --topic "precio del Bitcoin hoy" --yes   # acepta recomendaciones

# FASE A (alternativa analítica): informe de estrategia + viability + draft
npm run factory -- genesis --topic "mitología nórdica" \
  --video generative --video-provider veo --style cinematic \
  --voice-provider elevenlabs --text-provider anthropic

# Info y bucle de feedback (M6)
npm run factory -- providers            # proveedores IA por categoría
npm run factory -- styles               # estilos visuales para vídeo generativo
npm run factory -- metrics:sample luz-es && npm run factory -- feedback luz-es

# Worker en bucle (requiere Redis): programa y corre los canales activos
npm run factory -- worker luz-es

# Tests + typecheck
npm test
npm run typecheck
```

Los artefactos se generan en `./out/` (configurable con `FACTORY_DATA_DIR`):
`out/<canal>/<fecha>/{audio,video,queue}` y un store JSON en `out/_db/`.

### Proveedores de IA configurables (texto · voz · vídeo)

Todo es **swappable por config** y cada categoría cae a un *stub* determinista si falta
la clave, así que el pipeline **corre entero offline**. Los 3 proveedores top de cada
industria vienen integrados:

| Categoría | Cloud (de pago) | **Local ($0, self-hosted)** | Stub sin nada |
|-----------|-----------------|------------------------------|----------------|
| **Texto / LLM** | `anthropic`, `openai`, `gemini` (`auto`) | **`local`/`ollama`** (Ollama/LM Studio/vLLM, OpenAI-compat) | generación determinista |
| **Voz / TTS** | `elevenlabs` (v3), `openai`, `google` | **`kokoro`/`local`** (Kokoro/LocalAI), **`piper`** | WAV silencioso |
| **Imagen** | `openai` (gpt-image-1) | **`comfyui`** (FLUX / SDXL) | PNG de color / manifest |
| **Vídeo** | `veo` (3.1), `sora` (2), `runway` (Gen-4) | **`comfyui`** (Wan 2.2 / LTX-Video / HunyuanVideo) | clip de color / manifest |
| **Datos (luz)** | `preciodelaluz`, `esios` | (local por naturaleza) | `fixture` incluido |
| **Publicación** | YouTube direct-post; TikTok/IG `auto` | — | cola *assisted* 1-toque |
| **Estado / cola** | — | Postgres (`FACTORY_STORE`), BullMQ (`factory worker`) | JSON store / run puntual |

`factory providers` y `factory styles` listan lo disponible. Copia `.env.example` a `.env`.

### Modelos LOCALES — coste de IA: 0€

Todo el stack puede correr **self-hosted**, sin pagar APIs. Los mejores open-source de cada
categoría, integrados detrás de las mismas interfaces (caen a stub si el servidor no responde):

- **Texto:** [Ollama](https://ollama.com) (Qwen3 / Llama 4) — endpoint OpenAI-compatible.
- **Voz:** **Kokoro** (calidad casi-ElevenLabs, corre hasta en CPU) vía servidor OpenAI-compatible, o **Piper** (binario, rapidísimo).
- **Imagen:** **FLUX** / **SDXL** vía **ComfyUI**.
- **Vídeo:** **Wan 2.2** / **LTX-Video** / **HunyuanVideo** vía **ComfyUI**.

**Setup local en 1 comando** (levanta Ollama + Kokoro vía Docker, descarga el modelo,
configura `.env` y diagnostica):

```bash
npm run setup:local              # o: npm run setup:local -- qwen3
npm run doctor                   # ¿qué servidores locales / claves cloud hay activos?
npm run factory -- create --topic "curiosidades de la historia" --local
```

- `setup:local` usa `docker-compose.local.yml` (Ollama :11434 + Kokoro :8880; ComfyUI es
  un *profile* `gpu` opcional). Si no tienes Docker, te indica cómo instalar cada pieza.
- `doctor` sondea LLM/TTS/ComfyUI + ffmpeg + claves cloud y te dice qué se usará.
- **Auto local-first:** con `script.provider.name: auto`, si detecta un LLM local levantado
  lo usa **antes que el cloud** para ahorrar (invertible con `FACTORY_PREFER_CLOUD=1`).

`create --local` configura texto=Ollama, voz=Kokoro y **modo `images`** (1 imagen IA por
plano + Ken Burns, lo más barato). Ejemplo listo: `src/config/historia-local.yaml`.
Workflows de ComfyUI editables en `comfyui-workflows/`.

#### Windows

Funciona en Windows. El núcleo (CLI, pipeline, `run`/`create`/`doctor`/`validate`/
`genesis`/`feedback`) es Node/TS puro y multiplataforma — `npm install` + `npm run factory`
y listo. Notas:

- **Setup local:** usa el script PowerShell en vez del de bash:
  ```powershell
  npm run setup:local:win          # o: powershell -File scripts/setup-local.ps1 -Model qwen3
  ```
  (`npm run setup:local`, en bash, requiere WSL o Git Bash.)
- **Docker / 24/7:** `docker compose up -d --build` funciona igual con Docker Desktop.
- **Render real:** instala **ffmpeg** y ponlo en el `PATH` (p.ej. `winget install Gyan.FFmpeg`).
  Sin ffmpeg, el render cae a *manifest* (el resto del pipeline corre igual).
- **Modelos locales:** Ollama tiene instalador nativo para Windows; ComfyUI también corre
  en Windows (mejor con GPU NVIDIA).
- **Programación 24/7 sin Docker:** además del worker, puedes disparar `npm run factory -- run <id>`
  desde el **Programador de tareas** de Windows.

## Operación 24/7 (un solo comando)

Stack completo en Docker — **worker (BullMQ) + Postgres + Redis**, con perfiles opcionales
para la IA local:

```bash
docker compose up -d --build                  # worker + Postgres + Redis
docker compose --profile ai up -d --build     # + Ollama (LLM) y Kokoro (TTS) locales
docker compose --profile gpu up -d --build    # + ComfyUI (imagen/vídeo, requiere GPU)
# atajos npm: stack:up · stack:up:ai · stack:down · stack:logs
```

- El `worker` programa y ejecuta los canales `active` (trigger con data-gate / cron),
  aislado por canal e idempotente. Elige qué canales corre con `FACTORY_CHANNELS`
  (por defecto `luz-es`): `FACTORY_CHANNELS="luz-es historia-local" docker compose up -d`.
- Usa **Postgres** (`FACTORY_STORE=postgres`) y **Redis** automáticamente; los media van a
  un volumen `out`. Las claves cloud salen de tu `.env`; la IA local se resuelve por nombre
  de servicio (`ollama`/`kokoro`/`comfyui`) cuando su perfil está activo.
- Logs en vivo: `docker compose logs -f worker` (o `npm run stack:logs`).

### Vídeo generativo con IA + estilos

Pon `render.engine: generative` y una sección `video` en la config:

Modos de vídeo (`video.mode`): **`generative`** (un clip IA por plano: Veo/Sora/Runway o
Wan/LTX/Hunyuan local) o **`images`** (una imagen IA por plano + Ken Burns — el más barato,
ideal en local con FLUX/SDXL).

```yaml
render: { engine: generative, aspect_ratios: ["9:16"] }
video:
  mode: generative        # generative | images
  provider: veo            # veo | sora | runway | comfyui (local) | stub
  style: cinematic         # realistic | cinematic | documentary | anime | manga |
                           # comic | cartoon3d | claymation | pixelart | watercolor
  clip_seconds: 8
  resolution: "1080p"
  use_native_audio: false  # false = narrar con la voz TTS configurada
  max_clips: 5
voice: { provider: elevenlabs, voice_id: "<id>", model_id: eleven_v3 }
```

El pipeline genera un **storyboard** (LLM, con fallback determinista), construye un
**prompt por plano adaptado a cada proveedor y al estilo elegido**, genera un clip por
plano, y los **cose con FFmpeg** superponiendo la narración. Estilos extra: declara los
tuyos en `video.custom_styles`. Ejemplo listo: `src/config/luz-es-veo.yaml`.

```bash
npm run factory -- run luz-es-veo --dry-run   # offline: storyboard + prompts + manifest
```

---

## Guardarraíles anti-slop (QA Gate)

La etapa `qa` (`src/engine/qa/index.ts`) **bloquea la publicación** si:
- los hechos no están verificados (`safety.factsVerified = false`),
- no hay `headlineFact` o hay menos de 2 métricas (payload "vacío"),
- falta atribución de fuente,
- el adapter declara `riskNotes` (fuerza revisión humana),
- la duración excede el doble del objetivo (relleno / divagación).

Loudness fuera de objetivo y duración por debajo de banda son *warnings*, no bloqueos.

---

## Extras de calidad y distribución

- **Subtítulos (.srt):** la etapa `captions` genera subtítulos por formato, sincronizados con
  el audio (clave para la retención en autoplay silenciado). Sidecar por defecto, o **quemados**
  en el vídeo con `render.captions.burn_in: true`. Van también en el bundle *assisted*.
- **Thumbnails:** la etapa `thumbnail` crea una miniatura por vídeo (imagen IA si hay proveedor
  configurado, si no una *data-card* de marca con ffmpeg). Se adjunta a la metadata de YouTube
  y al bundle de publicación. Desactivable con `render.thumbnails.enabled: false`.
- **Trazabilidad:** `factory runs <canal>` lista las últimas ejecuciones (estado, etapa que
  falló, nº de salidas) desde el store (JSON o Postgres).
- **CI:** `.github/workflows/ci.yml` corre typecheck + tests + build + un *smoke* del CLI en
  **Ubuntu y Windows** (Node 20 y 22) en cada push.
- **Subtítulos exactos (Whisper):** `render.captions.align: whisper` alinea con el audio real
  vía un endpoint de transcripción (local faster-whisper/Speaches u OpenAI); si no, proporcional.
- **Música de fondo:** `render.music.enabled` + `track` mezcla una pista licenciada bajo la voz
  (post-pass ffmpeg a `volume_db`).
- **Moderación:** etapa `moderation` (blocklist determinista + LLM opcional) **bloquea** la
  publicación de contenido prohibido antes de gastar en media (`moderation` en la config).
- **A/B de títulos:** `ab_testing.titles` rota variantes de título por día; el feedback
  (`factory feedback`) atribuye cuál rinde más.
- **Distribución propia:** `distribution_own.newsletter`/`telegram_bot` emite una edición en
  texto/Markdown del payload (a fichero siempre; a Buttondown/Telegram si hay credenciales).
- **Multi-idioma:** `factory localize <canal> --to en,pt,fr` deriva canales hijos traducidos
  (LLM si hay clave) listos para activar.
- **Coste:** `factory estimate <canal>` calcula el gasto mensual por proveedor (local = $0).
- **YouTube auto:** sube además **miniatura** y **subtítulos** tras el vídeo (best-effort).

---

## Crecimiento, ingresos y operación

- **B-roll de stock gratis:** `render.broll.{enabled,provider}` (Pexels/Pixabay) pone un clip
  de archivo de fondo bajo el data-card en vez de color plano (sin coste; fallback a color).
- **Trend detection:** `factory trends [--source google|reddit --geo ES]`; el adapter
  `generative` puede anclar el tema del día a una tendencia (`data.config.trends.enabled`).
- **Cross-posting:** añade plataformas `x`, `bluesky`, `linkedin` a `platforms` y publica el
  texto + enlace del vídeo (con credenciales; si no, cola *assisted*). Se publican **después**
  del vídeo para incluir su URL.
- **Afiliados contextual + UTM:** define `niche.monetization.links` (vertical→URL); el sistema
  elige el enlace más relevante del día y lo inserta con UTM en descripciones y newsletter.
- **Alertas:** Discord (`DISCORD_WEBHOOK_URL`) y/o Telegram en cada fallo (y éxito si
  `FACTORY_ALERT_ON_SUCCESS=1`).
- **Dashboard web (UI SaaS):** `factory dashboard [--port 8787]` — interfaz moderna sin
  dependencias: **inicio** con KPIs y estado local, **asistente de creación** guiado (describe
  → propuesta de modelo/estilo → crear, sin código), **gestión de canales** (estado, coste,
  *run* de prueba) y **experimentos** sugeridos. Pensada para usuarios no técnicos.
- **Auto-experimentos:** `factory experiments <canal>` propone/sigue tests (título, hora,
  formato, duración) y concluye con el ganador cuando hay datos.
- **Multi-tenant (SaaS):** `FACTORY_TENANT=<org>` aísla datos (`out/_tenants/<org>`) y configs
  (`tenants/<org>/config`); el dashboard admite token (`FACTORY_DASHBOARD_TOKEN`).
- **Copyright/Content-ID:** el QA **bloquea** publicar con música sin licencia declarada
  (`render.music.library`); avisa de B-roll de stock (royalty-free) y etiqueta la IA como propia.

---

## Añadir un canal nuevo (sin código)

1. `npm run factory -- create --topic "<idea>"` → onboarding guiado: elige enfoque,
   estilo y modelo, y escribe la config (draft) con un adapter declarativo. **Cero código.**
2. Revisar la config, añadir claves en `.env` y las cuentas en secrets.
3. `npm run factory -- run <id> --dry-run` para previsualizar.
4. `npm run factory -- validate <id>` → poner `status: active`. El scheduler lo recoge.

> Coste de un canal nuevo: **describir la temática**. Para datos con feed propio, además
> pegar la URL del JSON. Solo casos muy a medida justifican un adapter en código (como
> `luz`). **Cero cambios en el núcleo.**

---

## Estado de implementación (roadmap del brief)

- **M1 — Núcleo + luz (MVP):** ✅ tipos, orquestador, adapter `luz`, pipeline completo
  (ingest→compute→script→voice→render→metadata→qa→publish→record), trigger con data-gate,
  CLI, store JSON, tests.
- **M2 — Multi-formato + render:** ✅ short + long desde el mismo payload; 9:16 / 16:9;
  motores `ffmpeg` / `remotion` (vía `FACTORY_REMOTION_ENTRY`) / generativo, todos detrás
  de `RenderEngine`.
- **M3 — Multiplataforma:** ✅ publishers YT/TikTok/IG con modos `auto`/`assisted` y
  variantes de copy/hashtags por plataforma.
- **M4 — Cola + estado:** ✅ store **Postgres** (`PostgresStore`) además del JSON, y
  **worker BullMQ** (`factory worker`, lazy-import). Stack 24/7 en `docker compose up`
  (worker + Postgres + Redis, perfiles `ai`/`gpu` para IA local).
- **M5 — Genesis:** ✅ `topic` → ChannelDefinition draft + informe + viability score, ahora
  con preferencias de proveedor/estilo (`--text-provider`, `--voice-provider`, `--video`,
  `--video-provider`, `--style`).
- **M6 — Feedback loop:** ✅ atribución de rendimiento (`deriveFeedback`) → recomendaciones
  de horario/formato/hook. `factory feedback <canal>` (+ `metrics:sample` para demo).
- **Generación por IA (texto/voz/imagen/vídeo):** ✅ 3 proveedores cloud top por categoría
  + sistema de estilos + storyboard + prompts por proveedor.
- **Modelos LOCALES ($0):** ✅ Ollama (texto), Kokoro/Piper (voz), ComfyUI FLUX/SDXL
  (imagen) y Wan/LTX/Hunyuan (vídeo); modo `images` con Ken Burns; `create --local`.

Las integraciones de pago van **sobre `fetch` detrás de interfaces** (sin SDKs): cambiar
de proveedor es config, no código.

---

## Stack

Node/TS de extremo a extremo · Zod (validación de schemas) · YAML (config) ·
Commander (CLI) · Vitest (tests). Sin SDKs de proveedor: las integraciones (Anthropic,
YouTube Data API) van sobre `fetch` detrás de interfaces swappables.
