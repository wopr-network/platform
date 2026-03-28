# ---------------------------------------------------------------------------
# Stage 1: Base — Node 22 + pnpm
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@10 --activate

# ---------------------------------------------------------------------------
# Stage 2: Dependencies — resolve workspace:* and install
# ---------------------------------------------------------------------------
FROM base AS deps
WORKDIR /app
COPY shells/wopr-platform-ui/docker.package.json ./package.json
COPY shells/wopr-platform-ui/docker.pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# Stage 3: Build — copy source and run next build
# ---------------------------------------------------------------------------
FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./

# Copy entire shell directory (app/, components/, lib/, src/, public/, configs, etc.)
COPY shells/wopr-platform-ui/ ./

# Copy .env files for brand config (separate layer for cache efficiency)
COPY shells/wopr-platform-ui/.env* ./

ENV NODE_OPTIONS="--max-old-space-size=4096"

# Source .env.brand before build so NEXT_PUBLIC_* vars are available
RUN set -a && . ./.env.brand && set +a && pnpm run build

# ---------------------------------------------------------------------------
# Stage 4: Production — standalone server
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS production

RUN groupadd wopr && useradd -g wopr -m wopr

WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Standalone output is FLAT (server.js at root) — single-package build
COPY --from=build /app/.next/standalone/ ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

USER wopr

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["node", "server.js"]
