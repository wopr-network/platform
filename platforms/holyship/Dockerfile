# ---------------------------------------------------------------------------
# Stage 1: Turbo prune — create minimal workspace subset
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS pruner

ARG PNPM_VERSION=10.31.0
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
RUN npm install -g turbo

WORKDIR /app
COPY . .
RUN turbo prune @wopr-network/holyship --docker

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
RUN pnpm turbo run build --filter=@wopr-network/holyship

# Create self-contained deployment with all dependencies resolved (no workspace links)
RUN pnpm --filter @wopr-network/holyship deploy --prod /app/deployed

# ---------------------------------------------------------------------------
# Stage 4: Runtime
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN groupadd -r holyship && useradd -r -g holyship -m holyship

# Production node_modules (pnpm deploy resolves all workspace:* links)
COPY --chown=holyship:holyship --from=build /app/deployed/node_modules ./node_modules

# Compiled output
COPY --chown=holyship:holyship --from=build /app/deployed/dist ./dist

# Migration files for schema versioning
COPY --chown=holyship:holyship --from=build /app/platforms/holyship/drizzle/ ./drizzle/

# Package manifest
COPY --chown=holyship:holyship --from=build /app/deployed/package.json ./

# Gates directory for flow engine gate scripts
RUN mkdir -p gates /tmp/fleet && chown holyship:holyship gates /tmp/fleet
COPY --chown=holyship:holyship --from=build /app/platforms/holyship/gates/ ./gates/

USER holyship

ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:${PORT}/health || exit 1

CMD ["node", "dist/index.js"]
