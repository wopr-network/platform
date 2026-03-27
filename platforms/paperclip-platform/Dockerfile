# ---------------------------------------------------------------------------
# Stage 1: Turbo prune — create minimal workspace subset
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS pruner

ARG PNPM_VERSION=10.31.0
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
RUN npm install -g turbo

WORKDIR /app
COPY . .
RUN turbo prune @wopr-network/paperclip-platform --docker

# ---------------------------------------------------------------------------
# Stage 2: Install dependencies from pruned workspace
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS deps

ARG PNPM_VERSION=10.31.0

# Build tools for native modules
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# Stage 3: Build
# ---------------------------------------------------------------------------
FROM deps AS build

COPY --from=pruner /app/out/full/ .
COPY --from=pruner /app/tooling ./tooling
RUN pnpm turbo run build --filter=@wopr-network/paperclip-platform

# Create standalone deployment with all deps resolved
RUN pnpm --filter @wopr-network/paperclip-platform deploy --legacy --prod /app/deployed

# ---------------------------------------------------------------------------
# Stage 4: Runtime
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS runtime

LABEL org.opencontainers.image.source=https://github.com/wopr-network/paperclip-platform

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Add node user to docker group (GID from host socket — overridden at runtime if needed)
RUN groupadd -g 1001 docker || true && usermod -aG docker node || true

# Create fleet data directory with node user ownership
RUN mkdir -p /data/fleet && chown -R node:node /data

# Self-contained deployment (all deps resolved, no workspace links)
COPY --chown=node:node --from=build /app/deployed/node_modules ./node_modules
COPY --chown=node:node --from=build /app/deployed/dist ./dist
COPY --chown=node:node --from=build /app/deployed/package.json ./

ENV NODE_ENV=production \
  HOST=0.0.0.0 \
  PORT=3200

# Injected at runtime by fleet / docker-compose:
#   PROVISION_SECRET  — shared secret for /internal/* and provision webhook
#   GATEWAY_URL       — platform-core inference gateway URL
#   PLATFORM_DOMAIN   — e.g. runpaperclip.com
#   UI_ORIGIN         — CORS origin for dashboard
#   DATABASE_URL      — Postgres (optional)
#   BTCPAY_*          — BTCPay Server crypto payment config (optional)

EXPOSE 3200

USER node
CMD ["node", "dist/index.js"]
