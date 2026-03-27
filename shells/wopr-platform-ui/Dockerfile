FROM node:24-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.31.0 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.31.0 --activate
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# API URL is derived from hostname at runtime — not baked at build time.
# Brand config (NEXT_PUBLIC_BRAND_*) is loaded from .env.brand.
RUN set -a && . ./.env.brand && set +a && pnpm build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app

RUN groupadd wopr && useradd -g wopr -m wopr

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

USER wopr

EXPOSE 3000

ENV HOSTNAME="0.0.0.0"
ENV PORT=3000
ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["node", "server.js"]
