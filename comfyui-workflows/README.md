# ComfyUI workflow templates (local image/video)

These are **ComfyUI API-format** graphs with placeholder tokens that the Channel Factory
fills at runtime: `{{PROMPT}}`, `{{NEGATIVE}}`, `{{WIDTH}}`, `{{HEIGHT}}`, `{{SEED}}`,
`{{SECONDS}}`, `{{FPS}}`.

Point a channel at one of these:

```yaml
image: { provider: comfyui, workflow: "comfyui-workflows/sdxl-image.json" }
# or, for local video models:
video: { mode: generative, provider: comfyui, workflow: "comfyui-workflows/wan-video.json" }
```

The factory queues the workflow on your ComfyUI server (`FACTORY_COMFYUI_URL`, default
`http://localhost:8188`), polls until done, and downloads the output. Inference cost: **0€**.

## Descarga automática de modelos

`npm run setup:comfyui` baja el mejor modelo de imagen según tu VRAM (FLUX.1 schnell o SDXL),
lo deja en `comfyui-models/` (bind-montado en el contenedor) y te indica qué workflow usar.

## Provided templates

- **`flux-schnell-image.json`** — FLUX.1 schnell (fp8, single-file). La mejor calidad open,
  licencia Apache (uso comercial), 4 pasos. Checkpoint: `flux1-schnell-fp8.safetensors`.
- **`flux-dev-image.json`** — FLUX.1 dev (fp8). Mejor detalle aún, pero licencia **NO comercial**.
  `npm run setup:comfyui -- flux-dev`.
- **`sdxl-image.json`** — Stable Diffusion XL text→image. Checkpoint: `sd_xl_base_1.0.safetensors`.
  Más ligero (8 GB VRAM).
- **`ltx-video.json`** — LTX-Video text→video (best-effort). `npm run setup:comfyui -- <modelo> video-ltx`
  baja el checkpoint + encoder T5. Requiere un ComfyUI reciente con nodos LTXV; re-exporta si falla.
- **`wan-video.json`** — placeholder for a local **text→video** model (Wan 2.2 / LTX-Video /
  HunyuanVideo). **Replace it with your own**: build the graph in ComfyUI, then
  *Save (API Format)*, and add the tokens above where prompt/size/length go. The final
  node must output a video (e.g. `VHS_VideoCombine`).

## How to export your own

In ComfyUI: enable dev mode → **Save (API Format)** → replace literal values with the
tokens. Any model with ComfyUI nodes works (FLUX, SD3.5, Wan, LTX, Hunyuan, Mochi…).
