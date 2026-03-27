# ---------------------------------------------------------------------------
# Stage 1: Install dependencies
# ---------------------------------------------------------------------------
FROM node:22-alpine AS deps

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# Stage 2: Build Next.js
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10 --activate
COPY --from=deps /app/node_modules ./node_modules
COPY . .
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
RUN pnpm build

# ---------------------------------------------------------------------------
# Stage 3: Runtime
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime

WORKDIR /app

RUN addgroup -S holyship && adduser -S holyship -G holyship

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static

USER holyship

EXPOSE 3000

ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["node", "server.js"]
