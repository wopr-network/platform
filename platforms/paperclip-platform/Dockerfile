FROM node:22-bookworm-slim AS base
ENV CI=true
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10 turbo@2.8.20

# --- Prune the monorepo to only packages needed by paperclip-platform ---
FROM base AS pruner
WORKDIR /app
COPY . .
RUN turbo prune @wopr-network/paperclip-platform --docker \
    && printf "packages:\n  - core/platform-core\n  - platforms/paperclip-platform\n" > out/json/pnpm-workspace.yaml \
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
# turbo build respects dependsOn: [^build], so platform-core and
# provision-client are compiled before paperclip-platform.
RUN pnpm turbo run build --filter=@wopr-network/paperclip-platform...

# Create a self-contained deploy directory with production deps only.
# --legacy is required for pnpm 10 workspaces without inject-workspace-packages.
# This bundles workspace deps (platform-core, provision-client) as real copies
# in node_modules — no symlinks, no workspace resolution needed at runtime.
RUN pnpm deploy --filter=@wopr-network/paperclip-platform --legacy --prod /app/deploy

# --- Production image (no build tools, no source, no dev deps) ---
FROM node:22-bookworm-slim AS production
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

RUN groupadd -g 1001 docker || true && usermod -aG docker node || true
RUN mkdir -p /data/fleet && chown -R node:node /data

COPY --chown=node:node --from=build /app/deploy/ .

ENV NODE_ENV=production HOST=0.0.0.0 PORT=3200
EXPOSE 3200
USER node
CMD ["node", "dist/index.js"]
