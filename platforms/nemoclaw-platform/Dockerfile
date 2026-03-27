# ---------------------------------------------------------------------------
# Stage 1: Turbo prune — create minimal workspace subset
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS pruner

ARG PNPM_VERSION=10.31.0
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
RUN npm install -g turbo

WORKDIR /app
COPY . .
RUN turbo prune @wopr-network/nemoclaw-platform --docker

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
RUN pnpm turbo run build --filter=@wopr-network/nemoclaw-platform

# Create self-contained deployment with all dependencies resolved (no workspace links)

# ---------------------------------------------------------------------------
# Stage 4: Runtime
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS runtime

# curl for HEALTHCHECK
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# DOCKER_GID should match the host docker group GID (e.g. pass --build-arg DOCKER_GID=$(getent group docker | cut -d: -f3))
# -f ensures groupadd succeeds even if the GID is already in use by another group in the image
ARG DOCKER_GID=998
RUN groupadd -r nemoclaw \
    && useradd -r -g nemoclaw -m nemoclaw \
    && groupadd -f -g "${DOCKER_GID}" dockersock \
    && usermod -aG dockersock nemoclaw

COPY --chown=nemoclaw:nemoclaw --from=deps /app/node_modules ./node_modules

# Compiled output
COPY --chown=nemoclaw:nemoclaw --from=build /app/platforms/nemoclaw-platform/dist ./dist

# Package manifest (needed by Node for ESM resolution)
COPY --chown=nemoclaw:nemoclaw --from=build /app/platforms/nemoclaw-platform/package.json ./
# Drizzle migrations from platform-core (workspace dep)
COPY --from=build /app/core/platform-core/drizzle ./node_modules/@wopr-network/platform-core/drizzle

# Migration files for schema versioning
COPY --chown=nemoclaw:nemoclaw --from=build /app/platforms/nemoclaw-platform/drizzle/ ./drizzle/

USER nemoclaw

ENV NODE_ENV=production
ENV PORT=3100

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:${PORT}/health || exit 1

CMD ["node", "dist/index.js"]
