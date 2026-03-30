# Incident Report: Docker BuildKit Deadlock — CI Builds Hanging

**Date:** 2026-03-30
**Severity:** High (CI pipeline completely blocked for ~3 hours)
**Status:** Resolved

## Summary

All CI Docker builds hung indefinitely after the `docker build` step completed image creation but before the `docker push` step could begin. This blocked all 4 product staging deploys for approximately 3 hours across multiple CI runs.

## Root Cause

The Docker daemon on the self-hosted runner host (WSL2) had a stale BuildKit state that caused a deadlock. A broken `desktop-linux` buildx builder (Docker Desktop remnant) was in `error` state with `protocol not available`, which corrupted the BuildKit process pool. New builds would complete image assembly but the buildx backend would never release control back to the Docker CLI, causing `docker build` and `docker push` commands to hang indefinitely.

## Timeline

| Time (UTC) | Event |
|------------|-------|
| ~20:25 | First staging deploy triggered after Vault migration commits |
| ~20:30 | WOPR API build completes, step hangs — never proceeds to UI build |
| ~21:00 | Cancelled, retried with `docker/build-push-action@v6` replaced by plain `docker build` + `docker push` |
| ~21:15 | Still hangs — same symptom with plain docker commands |
| ~21:30 | Switched from GHCR to self-hosted `registry.wopr.bot` — ruled out GHCR as cause |
| ~21:45 | Still hangs — confirmed it's the local Docker daemon, not the registry |
| ~22:00 | Restarted Docker daemon (`sudo systemctl restart docker`) |
| ~22:45 | Build completes in 5 min, push in 45s — daemon restart fixed it |
| ~22:50 | Runners restarted, CI triggered with working daemon |

## What Was Tried (Did NOT Fix)

1. Replaced `docker/build-push-action@v6` with plain `docker build` + `docker push` — same hang
2. Added `docker buildx stop/rm/create` between builds — same hang
3. Removed `--volumes` from `docker system prune` (auth preservation) — same hang
4. Mounted host `~/.docker/config.json` into runner containers — same hang
5. Switched from GHCR to `registry.wopr.bot` — same hang
6. `DOCKER_BUILDKIT=0` legacy builder — same hang
7. Bumped `max-parallel` from 1 to 3 — same hang (faster failure)

## What Fixed It

```bash
sudo systemctl restart docker
```

The stale BuildKit state was cleared by the daemon restart. A broken `desktop-linux` buildx builder was also removed:

```bash
docker buildx rm desktop-linux
```

## Additional Changes Made During Investigation

These changes were committed while debugging and remain in place (all improvements):

| Change | File | Reason |
|--------|------|--------|
| Switched from GHCR to `registry.wopr.bot` | `staging.yml`, `promote.yml` | Self-hosted registry on chain-server, eliminates GHCR dependency |
| Replaced `docker/build-push-action@v6` with plain `docker build`+`push` | `staging.yml` | Simpler, no buildx action wrapper |
| Removed `--volumes` from prune | `staging.yml` | Was wiping Docker auth config |
| Mounted host Docker config into runners | `docker-compose.yml` | Runners share host daemon auth |
| Added cleanup between API and UI builds | `staging.yml` | Prevents disk exhaustion |

## Self-Hosted Registry

Deployed `registry.wopr.bot` on chain-server (167.71.118.221) during this incident:

- Docker Registry v2 at `/opt/registry/`
- Storage: 100GB DO volume at `/mnt/registry` ($10/mo)
- Auth: htpasswd, credentials in Vault at `shared/registry`
- TLS: Caddy reverse proxy (same as Vault)
- DNS: `registry.wopr.bot` A → 167.71.118.221
- All 4 VPSes logged in and compose files updated

## Prevention

1. **Add Docker daemon health check to CI** — if `docker build` takes >10min, restart daemon and retry
2. **Remove Docker Desktop remnants** — `desktop-linux` builder should never exist on a server
3. **Monitor buildx state** — alert on builders in `error` state
4. **Periodic daemon restart** — consider a weekly cron to prevent state accumulation

## Self-Hosted Runner Architecture

```
WSL2 Host (32 CPU, 47GB RAM)
├── Docker Daemon (host)
│   ├── github-runners-runner-{1..10}  (CI job containers)
│   ├── github-runners-test-runner-{1..2}
│   └── (CI builds use host daemon via /var/run/docker.sock mount)
├── ~/.docker/config.json  (auth for registry.wopr.bot, mounted into runners)
└── /home/tsavo/platform   (monorepo, checked out by runners)
```

Key insight: `docker login` inside a runner container writes to the container's filesystem, but `docker push` uses the host daemon which reads the host's `~/.docker/config.json`. The runner compose now mounts the host config as read-only.
