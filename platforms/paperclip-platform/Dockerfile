FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10

FROM base AS deps
WORKDIR /app
COPY platforms/paperclip-platform/docker.package.json ./package.json
COPY platforms/paperclip-platform/docker.pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile --ignore-scripts --prod

FROM base AS build
WORKDIR /app
COPY platforms/paperclip-platform/docker.package.json ./package.json
COPY platforms/paperclip-platform/docker.pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY platforms/paperclip-platform/src ./src
COPY platforms/paperclip-platform/tsconfig.json ./tsconfig.json
RUN pnpm run build

FROM base AS production
WORKDIR /app
RUN groupadd -g 1001 docker || true && usermod -aG docker node || true
RUN mkdir -p /data/fleet && chown -R node:node /data
COPY --chown=node:node --from=deps /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node --from=build /app/package.json ./
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3200
EXPOSE 3200
USER node
CMD ["node", "dist/index.js"]
