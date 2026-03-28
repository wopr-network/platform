FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10

FROM base AS deps
WORKDIR /app
COPY platforms/nemoclaw-platform/package.json ./package.json
COPY scripts/docker-resolve-workspace.cjs ./resolve.cjs
RUN node resolve.cjs && rm resolve.cjs
RUN pnpm install --ignore-scripts --prod

FROM base AS build
WORKDIR /app
COPY platforms/nemoclaw-platform/package.json ./package.json
COPY scripts/docker-resolve-workspace.cjs ./resolve.cjs
RUN node resolve.cjs && rm resolve.cjs
RUN pnpm install --ignore-scripts
COPY platforms/nemoclaw-platform/src ./src
COPY platforms/nemoclaw-platform/tsconfig.json ./tsconfig.json
COPY platforms/nemoclaw-platform/drizzle ./drizzle
RUN pnpm run build

FROM base AS production
WORKDIR /app
ARG DOCKER_GID=998
RUN groupadd -r nemoclaw \
    && useradd -r -g nemoclaw -m nemoclaw \
    && groupadd -f -g "${DOCKER_GID}" dockersock \
    && usermod -aG dockersock nemoclaw
RUN mkdir -p /data/fleet && chown -R nemoclaw:nemoclaw /data
COPY --chown=nemoclaw:nemoclaw --from=deps /app/node_modules ./node_modules
COPY --chown=nemoclaw:nemoclaw --from=build /app/dist ./dist
COPY --chown=nemoclaw:nemoclaw --from=build /app/package.json ./
COPY --chown=nemoclaw:nemoclaw --from=build /app/drizzle/ ./drizzle/
ENV NODE_ENV=production PORT=3100
EXPOSE 3100
USER nemoclaw
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:${PORT}/health || exit 1
CMD ["node", "dist/index.js"]
