FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10

FROM base AS deps
WORKDIR /app
COPY platforms/holyship/package.json ./package.json
COPY scripts/docker-resolve-workspace.cjs ./resolve.cjs
RUN node resolve.cjs && rm resolve.cjs
RUN pnpm install --ignore-scripts --prod

FROM base AS build
WORKDIR /app
COPY platforms/holyship/package.json ./package.json
COPY scripts/docker-resolve-workspace.cjs ./resolve.cjs
RUN node resolve.cjs && rm resolve.cjs
RUN pnpm install --ignore-scripts
COPY platforms/holyship/src ./src
COPY platforms/holyship/tsconfig.json ./tsconfig.json
COPY platforms/holyship/drizzle ./drizzle
COPY platforms/holyship/gates ./gates
RUN pnpm run build

FROM base AS production
WORKDIR /app
RUN groupadd -r holyship && useradd -r -g holyship -m holyship
RUN mkdir -p /data/fleet && chown -R holyship:holyship /data
COPY --chown=holyship:holyship --from=deps /app/node_modules ./node_modules
COPY --chown=holyship:holyship --from=build /app/dist ./dist
COPY --chown=holyship:holyship --from=build /app/package.json ./
COPY --chown=holyship:holyship --from=build /app/drizzle/ ./drizzle/
COPY --chown=holyship:holyship --from=build /app/gates/ ./gates/
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001
EXPOSE 3001
USER holyship
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:${PORT}/health || exit 1
CMD ["node", "dist/index.js"]
