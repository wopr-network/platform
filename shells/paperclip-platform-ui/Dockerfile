# ---------------------------------------------------------------------------
# Paperclip UI — built from monorepo workspace
# ---------------------------------------------------------------------------

FROM node:22-bookworm-slim AS base
ENV CI=true
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10 turbo@2.8.20

# --- Prune monorepo to only packages needed by this shell ---
FROM base AS pruner
WORKDIR /app
COPY . .
RUN turbo prune @wopr-network/paperclip-platform-ui --docker \
    && cd out/json \
    && printf "packages:\n" > pnpm-workspace.yaml \
    && find . -mindepth 2 -name "package.json" -exec dirname {} \; | sed 's|^./||' | sort | awk '{print "  - "$0}' >> pnpm-workspace.yaml \
    && cp pnpm-workspace.yaml ../full/pnpm-workspace.yaml

# --- Install dependencies from pruned lockfile ---
FROM base AS deps
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN echo "node-linker=hoisted" > .npmrc && pnpm install --no-frozen-lockfile

# --- Build ---
FROM base AS build
WORKDIR /app
COPY --from=pruner /app/out/full/ .
COPY --from=deps /app/ .

ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=${NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY}

# Brand config + API URL for build-time inlining
COPY shells/paperclip-platform-ui/docker.env ./shells/paperclip-platform-ui/.env
ENV NODE_OPTIONS="--max-old-space-size=4096"

RUN pnpm turbo run build --filter=@wopr-network/paperclip-platform-ui

# --- Production ---
FROM node:22-bookworm-slim AS production
RUN groupadd paperclip && useradd -g paperclip -m paperclip
WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY --from=build /app/shells/paperclip-platform-ui/.next/standalone/ ./
COPY --from=build /app/shells/paperclip-platform-ui/.next/static ./.next/static
COPY --from=build /app/shells/paperclip-platform-ui/public ./public

USER paperclip
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["node", "server.js"]
