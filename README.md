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

### El punto de extensión: `NicheAdapter`

Lo único de dominio que se programa por canal (`src/adapters/_interface.ts`):

```ts
interface NicheAdapter {
  isReady(ctx): Promise<{ ready: boolean; reason?: string }>; // gate de frescura
  fetch(ctx): Promise<RawData>;                               // trae datos crudos
  analyze(raw, ctx): Promise<ContentPayload>;                 // lógica DETERMINISTA
}
```

**El LLM redacta, no inventa:** todas las cifras vienen de `analyze()` (determinista);
el LLM solo convierte datos en lenguaje natural en la etapa de guión.

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

# FASE A: generar un canal nuevo desde una idea
npm run factory -- genesis --topic "precio del gasóleo en España"

# Tests + typecheck
npm test
npm run typecheck
```

Los artefactos se generan en `./out/` (configurable con `FACTORY_DATA_DIR`):
`out/<canal>/<fecha>/{audio,video,queue}` y un store JSON en `out/_db/`.

### Modo offline vs. producción

El sistema corre **sin claves ni servicios externos**:

| Pieza | Sin credenciales (por defecto) | Producción |
|------|--------------------------------|------------|
| Datos (luz) | `source: fixture` (incluido) | `source: preciodelaluz` (sin token) / `esios` (token gratis) |
| Guión/metadata | generación determinista | Anthropic API (`ANTHROPIC_API_KEY`) |
| Voz (TTS) | stub: WAV de silencio dimensionado | ElevenLabs / Azure / Piper |
| Render | `ffmpeg` si está instalado, si no manifest JSON | Remotion (`data-card-v1`) |
| YouTube | cola *assisted* (1-toque) | direct post (`FACTORY_YT_ACCESS_TOKEN`) |
| TikTok / IG | cola *assisted* (1-toque) | `mode: auto` cuando la app esté aprobada |

Copia `.env.example` a `.env` para activar las piezas de producción.

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

## Añadir un canal nuevo (demuestra que es agnóstico)

1. `npm run factory -- genesis --topic "<idea>"` → `ChannelDefinition` (draft) + informe
   + (si aplica) spec de adapter.
2. Revisar/ajustar la config y la identidad de marca.
3. Si la fuente es nueva: implementar `src/adapters/<nicho>/` (solo `fetch` + `analyze`
   → `ContentPayload`) y registrarlo en `src/adapters/registry.ts`. Si reutiliza una
   fuente existente, ni eso.
4. Añadir credenciales de las cuentas en secrets/`.env`.
5. `npm run factory -- validate <id>` → pasar `status: active`.

> Coste de un canal nuevo: **una config** (si la fuente existe) o **una config + un
> adapter pequeño** (si es nueva). **Cero cambios en el núcleo.**

---

## Estado de implementación (roadmap del brief)

- **M1 — Núcleo + luz (MVP):** ✅ tipos, orquestador, adapter `luz`, pipeline completo
  (ingest→compute→script→voice→render→metadata→qa→publish→record), trigger con data-gate,
  CLI (`run`/`validate`/`genesis`/`adapters`), store JSON, tests.
- **M2 — Multi-formato:** ✅ short + long desde el mismo payload; render por aspect ratio
  (9:16 / 16:9). Remotion queda como engine enchufable detrás de `RenderEngine`.
- **M3 — Multiplataforma:** ✅ publishers YT/TikTok/IG con modos `auto`/`assisted` y
  variantes de copy/hashtags por plataforma. *(Newsletter propio: interfaz lista.)*
- **M4 — Estado/analítica:** ✅ store + trazabilidad por run; cola/Postgres/métricas
  quedan como swaps detrás de las interfaces (`Store`, `MetricsSource`).
- **M5 — Genesis:** ✅ `topic` → ChannelDefinition draft + informe + viability score.
- **M6 — Feedback loop:** interfaces definidas (`analytics/`), implementación pendiente.

Las piezas marcadas como "swap/pendiente" están **detrás de una interfaz** para
cambiarlas sin reescribir el núcleo (BullMQ, Postgres, Remotion, ElevenLabs, etc.).

---

## Stack

Node/TS de extremo a extremo · Zod (validación de schemas) · YAML (config) ·
Commander (CLI) · Vitest (tests). Sin SDKs de proveedor: las integraciones (Anthropic,
YouTube Data API) van sobre `fetch` detrás de interfaces swappables.
