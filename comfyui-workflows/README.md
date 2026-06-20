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

## Provided templates

- **`sdxl-image.json`** — Stable Diffusion XL text→image. Swap `ckpt_name` for your
  installed checkpoint (e.g. a FLUX or SDXL model). The final node is `SaveImage`.
- **`wan-video.json`** — placeholder for a local **text→video** model (Wan 2.2 / LTX-Video /
  HunyuanVideo). **Replace it with your own**: build the graph in ComfyUI, then
  *Save (API Format)*, and add the tokens above where prompt/size/length go. The final
  node must output a video (e.g. `VHS_VideoCombine`).

## How to export your own

In ComfyUI: enable dev mode → **Save (API Format)** → replace literal values with the
tokens. Any model with ComfyUI nodes works (FLUX, SD3.5, Wan, LTX, Hunyuan, Mochi…).
