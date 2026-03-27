# ---------------------------------------------------------------------------
# Stage 1: Turbo prune — extract only this package + its workspace deps
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS pruner
ARG PNPM_VERSION=10.31.0
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
RUN npm install -g turbo
WORKDIR /app
COPY . .
RUN turbo prune @wopr-network/holyship-platform-ui --docker

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
COPY --from=pruner /app/shells/holyship-platform-ui/.env* ./shells/holyship-platform-ui/
ARG NEXT_PUBLIC_API_URL
ARG API_INTERNAL_URL
ARG NEXT_PUBLIC_GITHUB_APP_URL
ARG NEXT_PUBLIC_BRAND_PRODUCT_NAME
ARG NEXT_PUBLIC_BRAND_DOMAIN
ARG NEXT_PUBLIC_BRAND_TAGLINE
ARG NEXT_PUBLIC_BRAND_STORAGE_PREFIX
ARG NEXT_PUBLIC_BRAND_HOME_PATH
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV API_INTERNAL_URL=${API_INTERNAL_URL}
ENV NEXT_PUBLIC_GITHUB_APP_URL=${NEXT_PUBLIC_GITHUB_APP_URL}
ENV NEXT_PUBLIC_BRAND_PRODUCT_NAME=${NEXT_PUBLIC_BRAND_PRODUCT_NAME}
ENV NEXT_PUBLIC_BRAND_DOMAIN=${NEXT_PUBLIC_BRAND_DOMAIN}
ENV NEXT_PUBLIC_BRAND_TAGLINE=${NEXT_PUBLIC_BRAND_TAGLINE}
ENV NEXT_PUBLIC_BRAND_STORAGE_PREFIX=${NEXT_PUBLIC_BRAND_STORAGE_PREFIX}
ENV NEXT_PUBLIC_BRAND_HOME_PATH=${NEXT_PUBLIC_BRAND_HOME_PATH}
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN pnpm --filter @wopr-network/holyship-platform-ui run build

# ---------------------------------------------------------------------------
# Stage 4: Runtime
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS runtime

RUN groupadd holyship && useradd -g holyship -m holyship

WORKDIR /app
ENV NODE_ENV=production

# Standalone output mirrors the monorepo structure under /app
COPY --from=build /app/shells/holyship-platform-ui/.next/standalone ./
COPY --from=build /app/shells/holyship-platform-ui/.next/static ./shells/holyship-platform-ui/.next/static
COPY --from=build /app/shells/holyship-platform-ui/public ./shells/holyship-platform-ui/public

USER holyship

EXPOSE 3000

ENV HOSTNAME=0.0.0.0
ENV PORT=3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["node", "shells/holyship-platform-ui/server.js"]
