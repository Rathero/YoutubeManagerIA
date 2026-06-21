# ¿Qué hardware necesito?

Ejecuta esto y te lo dice según tu equipo:

```bash
npm run factory -- hardware
```

La respuesta corta: **depende de si usas IA en la nube o local.**

---

## Opción A — Todo en la NUBE (lo más barato en hardware)

Cualquier portátil moderno sirve. La IA corre en los servidores del proveedor; tú solo
orquestas y subes vídeos.

| Componente | Requisito |
|---|---|
| CPU / RAM | cualquiera (4 GB RAM) · Node 20+ |
| GPU | **no hace falta** |
| Disco | ~1 GB (app) + lo que generes |
| Coste | el de las APIs (ver `factory estimate`) |

Es la vía recomendada para empezar. El **modo demo ($0)** funciona aquí sin ninguna clave.

---

## Opción B — Todo LOCAL ($0 de IA, pero pide máquina)

Aquí la IA corre en tu equipo. Lo que puedes mover depende sobre todo de la **VRAM** (GPU).

### Texto (LLM con Ollama)
| Nivel | Modelos | Necesitas |
|---|---|---|
| Básico | Llama 3.2 3B / Qwen3 4B | **8 GB RAM** (CPU vale, lento) o 6 GB VRAM |
| Equilibrado | Qwen3 8B–14B | **16 GB RAM** o **8–12 GB VRAM** |
| Máxima | Qwen3 32B / Llama 3.3 70B | **48 GB RAM** o **24 GB VRAM** (2 GPUs ideal) |

### Voz (Kokoro)
Corre **hasta en CPU**. ~4 GB RAM. Sin GPU necesaria.

### Imagen (ComfyUI) — `npm run setup:comfyui`
| Modelo | Calidad | VRAM | Disco |
|---|---|---|---|
| **SDXL** | muy buena | **8 GB** | ~7 GB |
| **FLUX.1 schnell** (fp8) | la mejor open · Apache (uso comercial) | **12 GB** (va con 8–10 con descarga a RAM, lento) | ~17 GB |

`setup:comfyui` **autodetecta tu VRAM** y elige FLUX (≥12 GB) o SDXL.

### Vídeo local (Wan 2.2 / LTX-Video / HunyuanVideo)
Lo más exigente: **12–24 GB VRAM** y bastante disco. Si no llegas, usa Veo/Sora/Runway en la nube.

---

## Recomendaciones de equipo

- **Empezar / probar:** tu portátil actual + modo demo, o claves cloud. **0 € de hardware.**
- **Local "todo gratis" cómodo:** GPU **NVIDIA con 12 GB+ VRAM** (RTX 3060 12 GB, 4070…),
  **32 GB RAM**, **100 GB SSD** libre. Mueve LLM mediano + FLUX + Kokoro sin problemas.
- **Local potente (vídeo incluido):** GPU **24 GB VRAM** (RTX 3090/4090), 64 GB RAM.
- **Mac (Apple Silicon):** M-series con **24 GB+ de memoria unificada**. Ollama y ComfyUI
  usan Metal; FLUX funciona pero más lento que en NVIDIA.
- **Servidor 24/7:** lo de arriba + Docker; Postgres/Redis añaden ~2 GB RAM.

> Puedes **mezclar**: texto y voz en local (baratos) y solo el vídeo en la nube, por ejemplo.
> Todo es configurable por canal.
