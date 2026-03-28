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
COPY scripts/docker-resolve-workspace.cjs ./scripts/
COPY shells/paperclip-platform-ui/package.json ./
RUN node scripts/docker-resolve-workspace.cjs
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# Stage 3: Build — copy source and run next build
# ---------------------------------------------------------------------------
FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./

ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=${NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY}

# Copy entire shell directory (app/, components/, lib/, src/, public/, configs, etc.)
COPY shells/paperclip-platform-ui/ ./

ENV NODE_OPTIONS="--max-old-space-size=4096"

RUN pnpm run build

# ---------------------------------------------------------------------------
# Stage 4: Production — standalone server
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS production

RUN groupadd paperclip && useradd -g paperclip -m paperclip

WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Standalone output is FLAT (server.js at root) — single-package build
COPY --from=build /app/.next/standalone/ ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

USER paperclip

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["node", "server.js"]
