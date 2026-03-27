# ---------------------------------------------------------------------------
# Stage 1: Turbo prune — extract only this package + its workspace deps
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS pruner
ARG PNPM_VERSION=10.31.0
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
RUN npm install -g turbo
WORKDIR /app
COPY . .
RUN turbo prune @wopr-network/paperclip-platform-ui --docker

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
COPY --from=pruner /app/shells/paperclip-platform-ui/.env* ./shells/paperclip-platform-ui/
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=${NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY}
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN pnpm --filter @wopr-network/paperclip-platform-ui run build

# ---------------------------------------------------------------------------
# Stage 4: Runtime
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS runtime

RUN groupadd paperclip && useradd -g paperclip -m paperclip

WORKDIR /app
ENV NODE_ENV=production

# Standalone output mirrors the monorepo structure
COPY --from=build /app/shells/paperclip-platform-ui/.next/standalone ./
COPY --from=build /app/shells/paperclip-platform-ui/.next/static ./shells/paperclip-platform-ui/.next/static
COPY --from=build /app/shells/paperclip-platform-ui/public ./shells/paperclip-platform-ui/public

USER paperclip

EXPOSE 3000

ENV HOSTNAME="0.0.0.0"
ENV PORT=3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["node", "shells/paperclip-platform-ui/server.js"]
