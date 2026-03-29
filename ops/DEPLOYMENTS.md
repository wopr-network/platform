# Deployment Guide

> All products deploy from the **wopr-network/platform** monorepo.
> Standalone repos are archived. npm publishing is NOT part of the deploy pipeline.

## Deploy Flow

### 1. Push to main

Push code to the `main` branch of `wopr-network/platform`. The staging workflow
(`.github/workflows/staging.yml`) automatically detects which products changed
and builds only the affected Docker images using `turbo prune`.

### 2. Staging auto-build

`staging.yml` runs on every push to `main`:

1. Detects changed files via `turbo prune` dependency graph
2. `core/` changes rebuild ALL 4 products (shared dependency)
3. `platforms/<product>/` or `shells/<product>/` changes rebuild only that product
4. Images are pushed to GHCR as `:staging`
5. SSH deploy to VPS, health check

### 3. Promote to production

```bash
gh workflow run promote.yml -f product=paperclip
# Options: paperclip | wopr | holyship | nemoclaw | all
```

The promote workflow does:
1. **DB backup** on the target VPS (via `ops/scripts/backup-prod.sh`)
2. **Retag** `:staging` to `:latest` in GHCR (saves `:latest-previous` for rollback)
3. **SSH deploy** to VPS: `docker compose pull && docker compose up -d --force-recreate`
4. **Health check** with retry (API + UI containers)
5. **Auto-rollback** on failure: restores previous images AND DB from backup

### Product → VPS mapping

| Product | VPS IP | Deploy dir |
|---------|--------|-----------|
| paperclip | 68.183.160.201 | /opt/paperclip-platform |
| wopr | 138.68.30.247 | /opt/wopr-platform |
| holyship | 138.68.46.192 | /opt/holyship |
| nemoclaw | 167.172.208.149 | /opt/nemoclaw-platform |

### Docker images (all built from monorepo)

| Image | Source |
|-------|--------|
| ghcr.io/wopr-network/paperclip-platform | platforms/paperclip-platform/Dockerfile |
| ghcr.io/wopr-network/paperclip-platform-ui | shells/paperclip-platform-ui/Dockerfile |
| ghcr.io/wopr-network/wopr-platform | platforms/wopr-platform/Dockerfile |
| ghcr.io/wopr-network/wopr-platform-ui | shells/wopr-platform-ui/Dockerfile |
| ghcr.io/wopr-network/holyship | platforms/holyship/Dockerfile |
| ghcr.io/wopr-network/holyship-platform-ui | shells/holyship-platform-ui/Dockerfile |
| ghcr.io/wopr-network/nemoclaw-platform | platforms/nemoclaw-platform/Dockerfile |
| ghcr.io/wopr-network/nemoclaw-platform-ui | shells/nemoclaw-platform-ui/Dockerfile |

## What changed from the old flow

- **No standalone repos** in the deploy loop. All source of truth is in the monorepo.
- **No npm publishing** for deploys. platform-core and platform-ui-core are workspace dependencies resolved at Docker build time via `turbo prune`.
- **No Watchtower**. CI/CD handles image promotion. Watchtower has been removed from all compose files to prevent standalone repo pushes from overwriting monorepo images.
- **Change detection** is automatic via turbo's dependency graph, not manual per-repo CI.

## Manual deploy (escape hatch)

If CI is broken, deploy manually from a local machine:

```bash
# Build the image locally
docker build -f platforms/paperclip-platform/Dockerfile -t ghcr.io/wopr-network/paperclip-platform:latest .
docker push ghcr.io/wopr-network/paperclip-platform:latest

# Deploy on VPS
ssh root@68.183.160.201 'cd /opt/paperclip-platform && docker compose pull && docker compose up -d --force-recreate && docker image prune -f'
```

## Rollback

If a promote fails, the workflow auto-rolls back. For manual rollback:

```bash
# Pull the previous image
docker pull ghcr.io/wopr-network/paperclip-platform:latest-previous
docker tag ghcr.io/wopr-network/paperclip-platform:latest-previous ghcr.io/wopr-network/paperclip-platform:latest
docker push ghcr.io/wopr-network/paperclip-platform:latest

# Restart on VPS
ssh root@68.183.160.201 'cd /opt/paperclip-platform && docker compose pull && docker compose up -d --force-recreate'
```

For DB rollback, restore from the backup created during promote:
```bash
ssh root@68.183.160.201 'ls -t /opt/paperclip-platform/backups/*.sql.gz | head -1'
# Then restore with pg_restore or gunzip | psql
```
