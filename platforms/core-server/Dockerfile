FROM node:22-bookworm-slim AS base
ENV CI=true
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10 turbo@2.8.20

# --- Prune the monorepo to only packages needed by core-server ---
FROM base AS pruner
WORKDIR /app
COPY . .
RUN turbo prune @wopr-network/core-server --docker \
    && cd out/json \
    && printf "packages:\n" > pnpm-workspace.yaml \
    && find . -mindepth 2 -name "package.json" -exec dirname {} \; | sed 's|^./||' | sort | awk '{print "  - "$0}' >> pnpm-workspace.yaml \
    && cp pnpm-workspace.yaml ../full/pnpm-workspace.yaml

# --- Install dependencies from the pruned lockfile ---
FROM base AS deps
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN echo "node-linker=hoisted" > .npmrc && pnpm install --no-frozen-lockfile

# --- Build all packages in dependency order ---
FROM base AS build
WORKDIR /app
COPY --from=pruner /app/out/full/ .
COPY --from=deps /app/ .
RUN pnpm turbo run build --filter=@wopr-network/core-server...

# --- Production image ---
FROM node:22-bookworm-slim AS production
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Copy node_modules (hoisted — flat layout, no symlinks for npm packages)
COPY --chown=node:node --from=build /app/node_modules ./node_modules

# Workspace packages are symlinks in hoisted mode — copy them explicitly
COPY --chown=node:node --from=build /app/core/platform-core ./node_modules/@wopr-network/platform-core
COPY --chown=node:node --from=build /app/services/provision-client ./node_modules/@wopr-network/provision-client

# Core server dist + package.json
COPY --chown=node:node --from=build /app/platforms/core-server/dist ./dist
COPY --chown=node:node --from=build /app/platforms/core-server/package.json ./

ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001
EXPOSE 3001
USER node
CMD ["node", "dist/index.js"]
