FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl git python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10

FROM base AS deps
WORKDIR /app
COPY platforms/wopr-platform/package.json ./package.json
COPY scripts/docker-resolve-workspace.cjs ./resolve.cjs
RUN node resolve.cjs && rm resolve.cjs
RUN pnpm install --ignore-scripts --prod

FROM base AS build
WORKDIR /app
COPY platforms/wopr-platform/package.json ./package.json
COPY scripts/docker-resolve-workspace.cjs ./resolve.cjs
RUN node resolve.cjs && rm resolve.cjs
RUN pnpm install --ignore-scripts
COPY platforms/wopr-platform/src ./src
COPY platforms/wopr-platform/tsconfig.json ./tsconfig.json
RUN pnpm run build

FROM base AS production
WORKDIR /app
ARG DOCKER_GID=998
RUN groupadd -r wopr \
    && useradd -r -g wopr -m wopr \
    && groupadd -f -g "${DOCKER_GID}" dockersock \
    && usermod -aG dockersock wopr
RUN mkdir -p /data/fleet && chown -R wopr:wopr /data
COPY --chown=wopr:wopr --from=deps /app/node_modules ./node_modules
COPY --chown=wopr:wopr --from=build /app/dist ./dist
COPY --chown=wopr:wopr --from=build /app/package.json ./
COPY --chown=wopr:wopr --from=build /app/drizzle/ ./drizzle/
COPY --chown=wopr:wopr --from=build /app/templates/ ./templates/
ENV NODE_ENV=production PORT=3100
EXPOSE 3100
USER wopr
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:${PORT}/health || exit 1
CMD ["node", "dist/index.js"]
