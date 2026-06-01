## Multi-stage Dockerfile for Next.js app (suitable for Hugging Face Spaces Docker runtime)
# - Builder stage installs deps and builds the Next app
# - Runner stage copies build artifacts and runs `npm run start` on $PORT (default 3000)

FROM node:18-bullseye-slim AS builder
WORKDIR /app

ARG PNPM_VERSION=10.25.0

# Build-time data-source configuration. HF Spaces "Variables" are NOT injected
# into Docker RUN steps automatically — only into the final runtime — so we
# bake the selected backend here. `DATA_BACKEND=v2` reads `SNAPSHOT_URL`
# directly; legacy DuckDB mode still clones `HF_DATASET_REPO` into the cache.
# Override at build time via `--build-arg ...`.
ARG DATA_BACKEND=v2
ARG HF_DATASET_REPO=https://huggingface.co/datasets/evaleval/card_backend
ARG SNAPSHOT_URL=https://huggingface.co/datasets/evaleval/card_backend/resolve/main/warehouse/2026-05-29T00-24-44Z
# Static prerender (`next build`) executes route handlers. In legacy mode the
# cache populated by `cache-hf-data.mjs` lives at `/app/.cache/hf-data`; in v2
# the cache step is skipped and the app reads the pinned Stage J snapshot.
ENV DATA_BACKEND=${DATA_BACKEND} \
    HF_DATASET_REPO=${HF_DATASET_REPO} \
    SNAPSHOT_URL=${SNAPSHOT_URL} \
    LOCAL_PIPELINE_OUTPUT=/app/.cache/hf-data \
    HF_DATA_LOCAL_DIR=/app/.cache/hf-data \
    HF_DATA_OFFLINE=1

# install OS build deps required by some native node modules and package manager
# copy lockfile first to leverage Docker layer caching
COPY package*.json ./
COPY pnpm-lock.yaml ./

# Install minimal build tools for native modules (node-gyp) and install pnpm.
# Using the repo's `pnpm-lock.yaml` keeps installs deterministic on Spaces.
ENV DEBIAN_FRONTEND=noninteractive \
	CI=true
RUN apt-get update \
	&& apt-get install -y --no-install-recommends ca-certificates python3 build-essential git curl \
	&& rm -rf /var/lib/apt/lists/* \
	&& npm install -g pnpm@${PNPM_VERSION} \
	&& pnpm install --frozen-lockfile

# copy source and build
COPY . ./
RUN pnpm run build

FROM node:18-bullseye-slim AS runner
WORKDIR /app

ARG DATA_BACKEND=v2
ARG SNAPSHOT_URL=https://huggingface.co/datasets/evaleval/card_backend/resolve/main/warehouse/2026-05-29T00-24-44Z

# Runtime needs the same data-source envs that the builder used. Docker
# multi-stage doesn't carry ENVs across stages, so keep backend selection and
# snapshot/cache pointers explicit here too.
ENV NODE_ENV=production \
    DATA_BACKEND=${DATA_BACKEND} \
    SNAPSHOT_URL=${SNAPSHOT_URL} \
    LOCAL_PIPELINE_OUTPUT=/app/.cache/hf-data \
    HF_DATA_LOCAL_DIR=/app/.cache/hf-data \
    HF_DATA_OFFLINE=1

# minimal runtime packages for HTTPS plus HF Spaces dev-mode git setup
RUN apt-get update && apt-get install -y ca-certificates git --no-install-recommends && rm -rf /var/lib/apt/lists/*

# copy runtime artifacts from builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/data ./data
COPY --from=builder /app/.cache ./.cache
COPY --from=builder /app/next.config.mjs ./next.config.mjs

# Expose a common port (informational). Hugging Face Spaces will inject $PORT at runtime
# and the CMD below ensures Next listens on that port. Do not hardcode PORT here.
EXPOSE 3000

# If you use private/gated HF models, set HF_TOKEN in the Space secrets and expose here
# e.g. in Space settings: add secret HF_TOKEN with your token

# Ensure `next start` uses the $PORT provided by the Spaces runtime. We use a shell
# wrapper so the environment variable is expanded at container runtime.
CMD ["sh", "-c", "npm run start -- -p ${PORT:-3000}"]
