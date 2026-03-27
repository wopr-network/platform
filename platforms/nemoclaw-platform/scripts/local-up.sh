#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."
docker compose \
  -f docker-compose.yml \
  -f docker-compose.local.yml \
  --env-file .env.local \
  up --build "$@"
