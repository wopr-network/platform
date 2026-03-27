# ---------------------------------------------------------------------------
# Stage 1: Turbo prune — create minimal workspace subset
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS pruner

ARG PNPM_VERSION=10.31.0
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
RUN npm install -g turbo

WORKDIR /app
COPY . .
RUN turbo prune @wopr-network/wopr-platform --docker

# ---------------------------------------------------------------------------
# Stage 2: Install dependencies from pruned workspace
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS deps

ARG PNPM_VERSION=10.31.0

# Build tools for native modules (better-sqlite3 in @wopr-network/wopr)
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
RUN pnpm turbo run build --filter=@wopr-network/wopr-platform

# ---------------------------------------------------------------------------
# Stage 4: Runtime
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS runtime

# curl for HEALTHCHECK, git for worktree provisioning
RUN apt-get update && apt-get install -y --no-install-recommends curl git && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# DOCKER_GID should match the host docker group GID (e.g. pass --build-arg DOCKER_GID=$(getent group docker | cut -d: -f3))
# -f ensures groupadd succeeds even if the GID is already in use by another group in the image
ARG DOCKER_GID=998
RUN groupadd -r wopr \
    && useradd -r -g wopr -m wopr \
    && groupadd -f -g "${DOCKER_GID}" dockersock \
    && usermod -aG dockersock wopr

# Production node_modules
COPY --chown=wopr:wopr --from=deps /app/node_modules ./node_modules

# WOPR sidecar — workspace package, copy built output from build stage
COPY --chown=wopr:wopr --from=build /app/sidecars/wopr/dist ./wopr-cli/dist
COPY --chown=wopr:wopr --from=build /app/sidecars/wopr/package.json ./wopr-cli/

# WOPR daemon binary wrapper
RUN printf '#!/bin/sh\nexec node /app/wopr-cli/dist/cli.js "$@"\n' > /usr/local/bin/wopr \
    && chmod +x /usr/local/bin/wopr

# Compiled output
COPY --chown=wopr:wopr --from=build /app/platforms/wopr-platform/dist ./dist

# Package manifest (needed by Node for ESM resolution)
COPY --chown=wopr:wopr --from=build /app/platforms/wopr-platform/package.json ./

# Profile templates loaded at runtime by fleet module
COPY --chown=wopr:wopr --from=build /app/platforms/wopr-platform/templates/ ./templates/

# Migration files for schema versioning
COPY --chown=wopr:wopr --from=build /app/platforms/wopr-platform/drizzle/ ./drizzle/

USER wopr

ENV NODE_ENV=production
ENV PORT=3100

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:${PORT}/health || exit 1

CMD ["node", "dist/index.js"]
