# ---------------------------------------------------------------------------
# Stage 1: Turbo prune — extract only this package + its workspace deps
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS pruner
ARG PNPM_VERSION=10.31.0
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
RUN npm install -g turbo
WORKDIR /app
COPY . .
RUN turbo prune @wopr-network/nemoclaw-platform-ui --docker

# ---------------------------------------------------------------------------
# Stage 2: Install dependencies from pruned lockfile
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS deps
ARG PNPM_VERSION=10.31.0
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# Stage 3: Build Next.js
# ---------------------------------------------------------------------------
FROM deps AS build
COPY --from=pruner /app/out/full/ .
COPY --from=pruner /app/tooling ./tooling
# Brand config is loaded from .env.brand at build time
ENV NODE_OPTIONS="--max-old-space-size=2048"
RUN set -a && . ./shells/nemoclaw-platform-ui/.env.brand && set +a && \
    pnpm turbo run build --filter=@wopr-network/nemoclaw-platform-ui

# ---------------------------------------------------------------------------
# Stage 4: Runtime
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS runtime

RUN groupadd nemoclaw && useradd -g nemoclaw -m nemoclaw

WORKDIR /app
ENV NODE_ENV=production

# Standalone output mirrors the monorepo structure under /app
COPY --from=build /app/shells/nemoclaw-platform-ui/.next/standalone ./
COPY --from=build /app/shells/nemoclaw-platform-ui/.next/static ./app/shells/nemoclaw-platform-ui/.next/static
COPY --from=build /app/shells/nemoclaw-platform-ui/public ./app/shells/nemoclaw-platform-ui/public

USER nemoclaw

EXPOSE 3000

ENV HOSTNAME="0.0.0.0"
ENV PORT=3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["node", "app/shells/nemoclaw-platform-ui/server.js"]
