# wopr-ops Repository Structure

> Implements: [method/devops/ops-repo-structure.md](../../method/devops/ops-repo-structure.md)

> Reference: the `wopr-network/wopr-ops` git repository serves as WOPR's operational logbook.
> See [logbook protocol](./logbook-protocol.md) for the protocol governing this repo.

---

## Repository Layout

```
wopr-ops/
+-- RUNBOOK.md              # Current production state
+-- DEPLOYMENTS.md          # Append-only deployment log
+-- MIGRATIONS.md           # Database migration log
+-- INCIDENTS.md            # Incident records
+-- GPU.md                  # GPU node status
+-- DECISIONS.md            # Architectural decisions
+-- TOPOLOGY.md             # Production architecture diagram
+-- docker-compose.yml      # Production compose
+-- docker-compose.local.yml # Local dev compose (flat single-host)
+-- Caddyfile               # Production Caddy config
+-- Caddyfile.local         # Local dev Caddy config
+-- nodes/
|   +-- vps-prod.md         # VPS node details
|   +-- gpu-prod.md         # GPU node details
+-- local/
    +-- docker-compose.yml  # DinD two-machine topology
    +-- gpu-seeder.sh       # Seeds GPU registration into DB
    +-- README.md           # DinD documentation
```

## The WOPR Stack

| Component | Technology | Where |
|-----------|-----------|-------|
| Platform API | Node.js + Hono + Drizzle | VPS (Docker container) |
| Platform UI | Next.js | VPS (Docker container) |
| Database | PostgreSQL | VPS (Docker container) |
| Reverse proxy | Caddy | VPS (Docker container) |
| Bot runtime | Dockerode (per-tenant containers) | VPS |
| GPU services | llama.cpp, whisper, chatterbox, embeddings | Separate GPU node |
| Container registry | GHCR (GitHub Container Registry) | GitHub |
| CD mechanism | Watchtower | VPS (polls GHCR for new images) |

## Logbook Files

### RUNBOOK.md

The single document that answers: "What is the current production state?"

Contents:
- State: `PRE-PRODUCTION` / `PRODUCTION` / `DEGRADED` / `DOWN`
- Go-live checklist with status of every item
- Stack table (services, ports, container names)
- VPS and GPU node tables (droplet ID, IP, SSH key)
- Secrets inventory (which secrets exist, not their values)
- Known gotchas and DinD quirks
- Rollback procedure

Every DevOps operation starts by reading RUNBOOK.md.

### DEPLOYMENTS.md

Append-only. Every deploy, rollback, and restart:

```
## 2026-03-06 14:32 UTC

- **Version**: v1.2.3 -> v1.2.4
- **Commit**: abc123def
- **Triggered by**: /wopr:devops deploy
- **Result**: SUCCESS
- **Health**: API 200, UI 200, DB connected
- **Duration**: 45s
- **Notes**: No downtime.
```

### MIGRATIONS.md

Every database migration with destructive-operation flag:

```
## Migration 0031 -- add_billing_tables

- **Date**: 2026-03-05
- **Type**: Schema change
- **Destructive**: YES (drops legacy_payments table)
- **Reversible**: NO
- **Status**: APPLIED (staging only)
- **Notes**: Requires human approval before production.
```

### INCIDENTS.md

Every production incident with root cause and prevention:

```
## INC-001 -- 2026-03-06 -- Platform API Crash Loop

- **Severity**: SEV2 (degraded service)
- **Started**: 2026-03-06T14:32:00Z
- **Detected by**: Health check (auto)
- **Resolved**: 2026-03-06T14:45:00Z
- **Root cause**: Migration 0031 dropped a table still referenced by a query
- **Resolution**: Rolled back to v1.2.3, reverted migration
- **Prevention**: Migration safety gate now flags DROP TABLE
- **Follow-up**: WOP-XXXX
```

### DECISIONS.md

Architectural and infrastructure decisions with rationale:

```
## Bare VPS over Managed Platforms

- **Decision**: Bare VPS with Docker instead of AWS/GCP/Vercel/Railway
- **Context**: WOPR needs per-tenant Docker containers via Dockerode
- **Alternatives**: AWS ECS, Kubernetes, Railway/Render (all abstract Docker socket)
- **Rationale**: Dockerode needs direct Docker socket access
- **Consequences**: We own the infrastructure. No auto-scaling. Manual provisioning.
- **Date**: 2026-02-15
```

### GPU.md

GPU node status, services running, provision history, and incident history. Updated after every GPU operation.

### TOPOLOGY.md

Production architecture diagram, CI/CD pipeline flow, port reference table, and hard constraints. Updated when the production topology changes.

### nodes/vps-prod.md

VPS node details: DigitalOcean droplet ID, public IP, SSH key fingerprint, operating system, Docker version, compose location, port table.

### nodes/gpu-prod.md

GPU node details: SSH endpoint, hardware spec, OS, CUDA version, compose location, model file paths.

## Compose Files

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Production services — used on VPS for live deployments |
| `docker-compose.local.yml` | Flat single-host local dev — use `--profile llm/voice` for GPU services |
| `local/docker-compose.yml` | DinD two-machine topology — VPS + GPU containers on bridge network |

## See Also

- [logbook-protocol.md](./logbook-protocol.md) — the mandatory read/write protocol for this repo
- [operations.md](./operations.md) — what the DevOps agent does with this repo
- [local-dev.md](./local-dev.md) — using the compose files for local development
