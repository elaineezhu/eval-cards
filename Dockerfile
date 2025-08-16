## Multi-stage Dockerfile for Next.js app (suitable for Hugging Face Spaces Docker runtime)
# - Builder stage installs deps and builds the Next app
# - Runner stage copies build artifacts and runs `npm run start` on $PORT (default 3000)

FROM node:18-bullseye-slim AS builder
WORKDIR /app

# install build deps and copy package files first for caching
# NOTE: this repository uses pnpm lockfile but no package-lock.json; `npm ci` requires
# a package-lock.json and will fail. Use `npm install` so the image builds reliably.
COPY package*.json ./
RUN npm install --silent

# copy source and build
COPY . ./
RUN npm run build

FROM node:18-bullseye-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

# minimal packages for certificates (if needed by model download / https)
RUN apt-get update && apt-get install -y ca-certificates --no-install-recommends && rm -rf /var/lib/apt/lists/*

# copy runtime artifacts from builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.mjs ./next.config.mjs

# Expose a common port (informational). Hugging Face Spaces will inject $PORT at runtime
# and the CMD below ensures Next listens on that port. Do not hardcode PORT here.
EXPOSE 3000

# If you use private/gated HF models, set HF_TOKEN in the Space secrets and expose here
# e.g. in Space settings: add secret HF_TOKEN with your token

# Ensure `next start` uses the $PORT provided by the Spaces runtime. We use a shell
# wrapper so the environment variable is expanded at container runtime.
CMD ["sh", "-c", "npm run start -- -p ${PORT:-3000}"]
