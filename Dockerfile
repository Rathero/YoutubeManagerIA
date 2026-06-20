# Channel Factory worker/CLI image. Includes ffmpeg for real renders.
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps (incl. optional pg/bullmq/ioredis) against the lockfile.
COPY package.json package-lock.json ./
RUN npm ci

# Build TypeScript → dist.
COPY . .
RUN npm run build

ENV NODE_ENV=production \
    FACTORY_DATA_DIR=/app/out

# Default to the doctor; compose overrides with the worker command.
ENTRYPOINT ["node"]
CMD ["dist/ops/cli.js", "doctor"]
