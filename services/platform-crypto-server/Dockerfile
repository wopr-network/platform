# ---------------------------------------------------------------------------
# Stage 1: Turbo prune — create minimal workspace subset
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS pruner

ARG PNPM_VERSION=10.31.0
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
RUN npm install -g turbo

WORKDIR /app
COPY . .
RUN turbo prune @wopr-network/platform-crypto-server --docker

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
RUN pnpm turbo run build --filter=@wopr-network/platform-crypto-server

# ---------------------------------------------------------------------------
# Stage 4: Runtime
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Production node_modules (full workspace tree for internal package resolution)
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/services/platform-crypto-server/node_modules ./services/platform-crypto-server/node_modules

# Compiled output
COPY --from=build /app/services/platform-crypto-server/dist ./dist

# Migration files for schema versioning
COPY --from=build /app/services/platform-crypto-server/drizzle/ ./drizzle/

# Package manifest
COPY --from=build /app/services/platform-crypto-server/package.json ./

ENV NODE_ENV=production

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3100/health || exit 1

CMD ["node", "dist/entry.js"]
