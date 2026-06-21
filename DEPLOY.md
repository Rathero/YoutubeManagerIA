# Montar la infra online (copia y pega)

Dos caminos. Elige según lo que quieras:

- **Camino A — Test de 1 semana, lo más simple:** una sola caja **con GPU** (Vast.ai/RunPod)
  que corre **TODO** (app + IA local). La enciendes mientras pruebas. **~€5-8/semana.**
- **Camino B — Producción barata a largo plazo:** un **cerebro CPU 24/7** (Hetzner/Oracle)
  + **GPU a demanda** solo para generar. Más barato sostenido (ver `factory estimate --infra`).

> El repo es privado. Para clonar en la VM usa una de estas:
> - URL con token: `REPO="https://<TOKEN_GITHUB>@github.com/rathero/youtubemanageria.git"`
> - o copia la carpeta por SSH: `scp -r ./YoutubeManagerIA usuario@IP:~/`

---

## Camino A — Una caja GPU con todo (test rápido)

### 1) Alquila la GPU
- **Vast.ai** (más barato) o **RunPod**. Elige una **RTX 3090 / 4090 (24 GB VRAM)**,
  imagen base **Ubuntu + CUDA con Docker** (en RunPod: "PyTorch" o "Docker" template).
- Asegúrate de exponer el puerto **8787** (y abre 8188/11434 si los quieres ver).

### 2) Dentro de la caja (SSH)
```bash
# clona (o sube por scp) y entra
REPO="https://<TOKEN_GITHUB>@github.com/rathero/youtubemanageria.git" \
  bash <(curl -fsSL https://raw.githubusercontent.com/rathero/youtubemanageria/HEAD/scripts/deploy-vm.sh) --ai --gpu
# (si ya clonaste:  sudo bash scripts/deploy-vm.sh --ai --gpu )
```
Esto instala Docker, levanta worker + Postgres + Redis + Dashboard + Ollama + Kokoro + ComfyUI,
descarga el modelo de Ollama y te imprime la **URL del panel con token**.

### 3) Modelos de imagen (FLUX/SDXL)
```bash
cd channel-factory   # o donde esté el repo
npm run setup:comfyui            # autodetecta tu GPU y baja FLUX o SDXL
# vídeo local opcional:  VIDEO=ltx npm run setup:comfyui -- flux-schnell video-ltx
```

### 4) Abre el panel
Abre la URL que imprimió el script: `http://<IP>:8787/?token=<TOKEN>` → **Crear canal** y a probar.

### 5) Apagar (para no pagar de más)
Cuando termines la sesión, **destruye/parar la instancia** en Vast/RunPod (la GPU se cobra por hora).

---

## Camino B — Cerebro CPU 24/7 + GPU a demanda (largo plazo)

### 1) El cerebro (siempre encendido, barato)
- **Hetzner Cloud CX32** (4 vCPU/8 GB, ~€6,5/mes) con **Ubuntu 24.04**. *(O una VM Oracle Always Free = €0.)*
- En el panel de Hetzner crea un **Firewall** que permita tu IP en el puerto **8787** (y 22 para SSH).

```bash
ssh root@<IP_DEL_CEREBRO>
REPO="https://<TOKEN_GITHUB>@github.com/rathero/youtubemanageria.git" \
  bash <(curl -fsSL https://raw.githubusercontent.com/rathero/youtubemanageria/HEAD/scripts/deploy-vm.sh)
# (sin --ai: la IA va por API o por la GPU a demanda; ver paso 3)
```
Edita `.env` y pon tus claves cloud si vas a usar APIs (`nano .env`), luego `docker compose up -d`.

### 2) La GPU a demanda (solo cuando generas)
Cuando toque generar, levanta una caja GPU (Vast/RunPod) con **Ollama + ComfyUI** y exponла:
```bash
# en la caja GPU
sudo bash scripts/deploy-vm.sh --ai --gpu
npm run setup:comfyui
```
Anota la **IP pública** y los puertos de la GPU (11434 Ollama, 8188 ComfyUI).

### 3) Apunta el cerebro a la GPU
En el `.env` **del cerebro**:
```env
FACTORY_LOCAL_LLM_URL=http://<IP_GPU>:11434/v1
FACTORY_COMFYUI_URL=http://<IP_GPU>:8188
```
`docker compose up -d` en el cerebro. El worker usará la GPU remota mientras esté encendida;
si la apagas, cae a stub/cloud automáticamente.

> Para volumen real, automatiza encender/apagar la GPU alrededor de la hora de generación
> (cron + API de Vast/RunPod). Así pagas minutos, no meses.

---

## Seguridad (importante en una VM pública)
- El script **genera un `FACTORY_DASHBOARD_TOKEN`** y protege la UI. Abre el panel con
  `…:8787/?token=<TOKEN>` una vez (se recuerda en el navegador).
- Mejor aún: **no expongas 8787** y usa un túnel SSH desde tu PC:
  ```bash
  ssh -L 8787:localhost:8787 root@<IP>
  # luego abre http://localhost:8787 en tu navegador
  ```
- Mantén las **claves API** solo en el `.env` del servidor (nunca en git).

## Almacenamiento de media (opcional)
Para el test vale el disco de la VM. Si creces, usa **Cloudflare R2** (10 GB gratis, sin coste
de egress) o Backblaze B2 y monta/–sincroniza la carpeta `out/`.

## Costes — compáralos con tus números
```bash
npm run factory -- estimate <canal> --infra
```
Te imprime: APIs vs GPU a demanda vs GPU 24/7 (evítala) vs GPU propia, y el break-even.

## Parar / limpiar
```bash
docker compose down            # para el stack (conserva volúmenes/datos)
docker compose down -v         # + borra volúmenes (Postgres, media)
# en Vast/RunPod: DESTRUYE la instancia GPU para dejar de pagar
```
