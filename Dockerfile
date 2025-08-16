## Multi-stage Dockerfile for Next.js app (suitable for Hugging Face Spaces Docker runtime)
# - Builder stage installs deps and builds the Next app
# - Runner stage copies build artifacts and runs `npm run start` on $PORT (default 3000)

FROM node:18-bullseye-slim AS builder
WORKDIR /app

# install build deps and copy package files first for caching
COPY package*.json ./
RUN npm ci --silent

# copy source and build
COPY . ./
RUN npm run build

FROM node:18-bullseye-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# minimal packages for certificates (if needed by model download / https)
RUN apt-get update && apt-get install -y ca-certificates --no-install-recommends && rm -rf /var/lib/apt/lists/*

# copy runtime artifacts from builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.js ./next.config.js

# Expose the port the app will run on (Spaces expects the app to listen on this port)
EXPOSE 3000

# If you use private/gated HF models, set HF_TOKEN in the Space secrets and expose here
# e.g. in Space settings: add secret HF_TOKEN with your token

CMD ["npm", "run", "start"]
