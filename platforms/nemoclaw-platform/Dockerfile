# ---------------------------------------------------------------------------
# Global build arguments
# ---------------------------------------------------------------------------
ARG PNPM_VERSION=10.31.0

# ---------------------------------------------------------------------------
# Stage 1: Install production dependencies
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS deps

ARG PNPM_VERSION

# Install pnpm via corepack
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# ---------------------------------------------------------------------------
# Stage 2: Build TypeScript
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS build

ARG PNPM_VERSION

RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

WORKDIR /app

# Full node_modules (including devDeps) needed for tsc
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src/ ./src/
RUN pnpm build

# ---------------------------------------------------------------------------
# Stage 3: Runtime
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

# Production node_modules
COPY --chown=nemoclaw:nemoclaw --from=deps /app/node_modules ./node_modules

# Compiled output
COPY --chown=nemoclaw:nemoclaw --from=build /app/dist ./dist

# Package manifest (needed by Node for ESM resolution)
COPY --chown=nemoclaw:nemoclaw package.json ./

# Migration files for schema versioning
COPY --chown=nemoclaw:nemoclaw drizzle/ ./drizzle/

USER nemoclaw

ENV NODE_ENV=production
ENV PORT=3100

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:${PORT}/health || exit 1

CMD ["node", "dist/index.js"]
