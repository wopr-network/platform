FROM node:22-bookworm-slim AS base
ENV CI=true
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10 turbo@2.8.20

# --- Prune the monorepo to only packages needed by nemoclaw-platform ---
FROM base AS pruner
WORKDIR /app
COPY . .
RUN turbo prune @wopr-network/nemoclaw-platform --docker \
    && printf "packages:\n  - core/platform-core\n  - platforms/nemoclaw-platform\n" > out/json/pnpm-workspace.yaml \
    && cp out/json/pnpm-workspace.yaml out/full/pnpm-workspace.yaml

# --- Install dependencies from the pruned lockfile ---
FROM base AS deps
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile

# --- Build all packages in dependency order ---
FROM base AS build
WORKDIR /app
COPY --from=pruner /app/out/full/ .
COPY --from=deps /app/ .
RUN pnpm turbo run build --filter=@wopr-network/nemoclaw-platform...

# Create a self-contained deploy directory with production deps only.
# --legacy is required for pnpm 10 workspaces without inject-workspace-packages.
RUN pnpm deploy --filter=@wopr-network/nemoclaw-platform --legacy --prod /app/deploy

# --- Production image (no build tools, no source, no dev deps) ---
FROM node:22-bookworm-slim AS production
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

ARG DOCKER_GID=998
RUN groupadd -r nemoclaw \
    && useradd -r -g nemoclaw -m nemoclaw \
    && groupadd -f -g "${DOCKER_GID}" dockersock \
    && usermod -aG dockersock nemoclaw
RUN mkdir -p /data/fleet && chown -R nemoclaw:nemoclaw /data

COPY --chown=nemoclaw:nemoclaw --from=build /app/deploy/ .

ENV NODE_ENV=production PORT=3100
EXPOSE 3100
USER nemoclaw
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:${PORT}/health || exit 1
CMD ["node", "dist/index.js"]
