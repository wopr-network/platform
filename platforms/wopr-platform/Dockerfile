FROM node:22-bookworm-slim AS base
ENV CI=true
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl git python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10 turbo@2.8.20

# --- Prune the monorepo to only packages needed by wopr-platform ---
FROM base AS pruner
WORKDIR /app
COPY . .
RUN turbo prune @wopr-network/wopr-platform --docker \
    && cd out/json \
    && printf "packages:\n" > pnpm-workspace.yaml \
    && find . -mindepth 2 -name "package.json" -exec dirname {} \; | sed 's|^./||' | sort | awk '{print "  - "$0}' >> pnpm-workspace.yaml \
    && cp pnpm-workspace.yaml ../full/pnpm-workspace.yaml

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
RUN pnpm turbo run build --filter=@wopr-network/wopr-platform...

# Create a self-contained deploy directory with production deps only.
# --legacy is required for pnpm 10 workspaces without inject-workspace-packages.
RUN pnpm deploy --filter=@wopr-network/wopr-platform --legacy --prod /app/deploy

# --- Production image (no build tools, no source, no dev deps) ---
FROM node:22-bookworm-slim AS production
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl git && rm -rf /var/lib/apt/lists/*
WORKDIR /app

ARG DOCKER_GID=998
RUN groupadd -r wopr \
    && useradd -r -g wopr -m wopr \
    && groupadd -f -g "${DOCKER_GID}" dockersock \
    && usermod -aG dockersock wopr
RUN mkdir -p /data/fleet && chown -R wopr:wopr /data \
    && ln -s /data /app/data

COPY --chown=wopr:wopr --from=build /app/deploy/ .

ENV NODE_ENV=production PORT=3100
EXPOSE 3100
USER wopr
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:${PORT}/health || exit 1
CMD ["node", "dist/index.js"]
