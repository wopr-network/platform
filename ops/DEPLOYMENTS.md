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

## Node agent bootstrap (DB-as-channel architecture)

After the leaderless queue refactor, the core-server container no longer
runs its own docker handlers. A separate `node-agent` container drains
`pending_operations` rows for this host. One-time bootstrap per droplet:

### First-time setup on a fresh droplet

```bash
ssh root@138.68.30.247
cd /opt/core-server

# 1. Make sure HOST_DOCKER_GID in .env matches the host docker group gid.
stat -c '%g' /var/run/docker.sock   # e.g. 988
echo "HOST_DOCKER_GID=988" >> .env

# 2. Pull the new compose + images (the deploy workflow already does this
#    on every push to main — run manually only if you're bootstrapping
#    ahead of a push).
docker compose pull

# 3. Bring up everything except the agent first.
docker compose up -d postgres core wopr-ui paperclip-ui nemoclaw-ui holyship holyship-ui caddy
docker compose exec core curl -sf http://localhost:3001/health

# 4. Mint a registration token from the healthy core.
TOKEN=$(docker compose exec -T core node dist/bootstrap-agent.js | jq -r .token)
echo "AGENT_REGISTRATION_TOKEN=$TOKEN" >> .env

# 5. Start the agent — it consumes the token on first boot and persists
#    credentials.json to the agent_credentials named volume.
docker compose up -d node-agent
docker compose logs --tail=50 node-agent

# 6. After the agent reports "Registered as node-...", remove the token
#    from .env (single-use, already consumed).
sed -i '/^AGENT_REGISTRATION_TOKEN=/d' .env
```

### Verifying the agent is draining the queue

```bash
# Agent worker should be running and connected
docker compose logs --tail=20 node-agent | grep "Agent queue worker started"

# The PeriodicScheduler in core will enqueue core.janitor.sweep every 30s
# and core.fleet.reconcile every 60s. Both should reach `succeeded`.
docker compose exec -T postgres psql -U core -d platform -c "
  SELECT type, target, status, completed_at
  FROM pending_operations
  WHERE type LIKE 'core.%'
  ORDER BY enqueued_at DESC LIMIT 5
"
```

### Restart behavior

After the one-time bootstrap, `docker compose up -d --force-recreate` (which
the deploy workflow runs on every push to main) recreates the agent using
the persisted credentials. No token needed.

### Rotating agent credentials

To rotate the agent's node_secret:
```bash
# Delete the persisted credentials + the node row, then re-bootstrap.
docker compose stop node-agent
docker volume rm coreserver_agent_credentials
docker compose exec -T postgres psql -U core -d platform -c "DELETE FROM nodes WHERE id LIKE 'node-%'"
# Then repeat steps 4-6 above.
```
