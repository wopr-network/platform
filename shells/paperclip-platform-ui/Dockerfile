FROM node:20-alpine AS deps
LABEL org.opencontainers.image.source=https://github.com/wopr-network/paperclip-platform-ui
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.31.0 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.31.0 --activate
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=${NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY}
# API URL derived from hostname at runtime — no build-time baking
ENV NODE_OPTIONS="--max-old-space-size=2048"
RUN pnpm --filter @wopr-network/platform-ui-core run build && pnpm --filter @wopr-network/paperclip-platform-ui run build

FROM node:20-alpine AS runtime
WORKDIR /app

RUN addgroup -S paperclip && adduser -S paperclip -G paperclip

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

USER paperclip

EXPOSE 3000

ENV HOSTNAME="0.0.0.0"
ENV PORT=3000
ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["node", "server.js"]
