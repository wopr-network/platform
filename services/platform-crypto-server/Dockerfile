FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10

FROM base AS deps
WORKDIR /app
COPY services/platform-crypto-server/package.json ./package.json
COPY scripts/docker-resolve-workspace.js ./resolve.js
RUN node resolve.js && rm resolve.js
RUN pnpm install --ignore-scripts --prod

FROM base AS build
WORKDIR /app
COPY services/platform-crypto-server/package.json ./package.json
COPY scripts/docker-resolve-workspace.js ./resolve.js
RUN node resolve.js && rm resolve.js
RUN pnpm install --ignore-scripts
COPY services/platform-crypto-server/src ./src
COPY services/platform-crypto-server/tsconfig.json ./tsconfig.json
RUN pnpm run build

FROM base AS production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
COPY --from=build /app/drizzle/ ./drizzle/
ENV NODE_ENV=production PORT=3100
EXPOSE 3100
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:${PORT}/health || exit 1
CMD ["node", "dist/entry.js"]
