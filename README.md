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

# Crear un canal SIN código (guiado): describe la temática y te lleva al modelo+estilo
npm run factory -- create --topic "curiosidades del espacio"
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

| Categoría | Proveedores (config) | Stub sin clave |
|-----------|----------------------|----------------|
| **Texto / LLM** (guión, metadata, storyboard, genesis) | `anthropic` (Claude), `openai` (GPT), `gemini` · `auto` elige el primero con clave | generación determinista |
| **Voz / TTS** (lo más humano) | `elevenlabs` (v3, el más realista), `openai` (gpt-4o-mini-tts), `google` (Gemini TTS) | WAV silencioso dimensionado |
| **Vídeo generativo** | `veo` (Veo 3.1, audio nativo), `sora` (Sora 2), `runway` (Gen-4) | clip de color / manifest |
| **Render data-card** | `ffmpeg`, `remotion` (`FACTORY_REMOTION_ENTRY`) | manifest JSON |
| **Datos (luz)** | `preciodelaluz` (sin token), `esios` (token gratis) | `fixture` incluido |
| **Publicación** | YouTube direct-post (`FACTORY_YT_ACCESS_TOKEN`); TikTok/IG `auto` con app aprobada | cola *assisted* 1-toque |
| **Estado** | `FACTORY_STORE=postgres` (+ `DATABASE_URL`) | JSON store en `out/_db` |
| **Scheduling** | `factory worker` (BullMQ + `REDIS_URL`) | `factory run` puntual |

`factory providers` y `factory styles` listan lo disponible. Copia `.env.example` a `.env`
para activar producción.

### Vídeo generativo con IA + estilos

Pon `render.engine: generative` y una sección `video` en la config:

```yaml
render: { engine: generative, aspect_ratios: ["9:16"] }
video:
  mode: generative
  provider: veo            # veo | sora | runway | stub
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
  **worker BullMQ** (`factory worker`, lazy-import). Selección por env.
- **M5 — Genesis:** ✅ `topic` → ChannelDefinition draft + informe + viability score, ahora
  con preferencias de proveedor/estilo (`--text-provider`, `--voice-provider`, `--video`,
  `--video-provider`, `--style`).
- **M6 — Feedback loop:** ✅ atribución de rendimiento (`deriveFeedback`) → recomendaciones
  de horario/formato/hook. `factory feedback <canal>` (+ `metrics:sample` para demo).
- **Generación por IA (texto/voz/vídeo):** ✅ 3 proveedores top por categoría + sistema de
  estilos + storyboard + prompts por proveedor.

Las integraciones de pago van **sobre `fetch` detrás de interfaces** (sin SDKs): cambiar
de proveedor es config, no código.

---

## Stack

Node/TS de extremo a extremo · Zod (validación de schemas) · YAML (config) ·
Commander (CLI) · Vitest (tests). Sin SDKs de proveedor: las integraciones (Anthropic,
YouTube Data API) van sobre `fetch` detrás de interfaces swappables.
