# Local Development — The WOPR Implementation

> Implements: [method/devops/local-dev.md](../../method/devops/local-dev.md)

---

## Two Local Environments

WOPR's local development uses two distinct approaches depending on what is being tested.

## DinD Two-Machine Topology

Docker-in-Docker replication of the production two-node topology. Two containers on a bridge network mirror the VPS + GPU node architecture:

```
wopr-dev bridge network
  ├── vps (docker:27-dind)
  │     ├── platform-api  (port 3000)
  │     ├── platform-ui   (port 3001)
  │     ├── postgres      (port 5432)
  │     └── caddy         (ports 80, 443)
  └── gpu (nvidia/cuda)
        ├── llama.cpp     (port 8080)
        ├── whisper       (port 8081)
        ├── chatterbox    (port 8082)
        └── embeddings    (port 8083)
```

Platform-api reaches GPU services via the bridge network (`gpu:8080`, `gpu:8081`, etc.) — the same way it does in production. The VPS container uses DinD so the platform's Dockerode-based bot runtime can spawn child containers inside it.

Compose files live in `wopr-ops/local/`:

```bash
# Start the two-machine DinD topology
docker compose -f wopr-ops/local/docker-compose.yml up -d

# Seed GPU registration into the database
wopr-ops/local/gpu-seeder.sh
```

### What DinD catches

- Deploy scripts that hardcode `localhost` (fail to reach the GPU node)
- Credential propagation issues (env vars that must be injected cross-container)
- Caddy TLS config that assumes direct socket access
- DinD-specific `docker.sock` path differences

### DinD gotchas

- The GPU container's Docker socket is at a non-default path inside DinD — check `DOCKER_HOST` env var
- Caddy inside the VPS container needs `--cap-add NET_ADMIN` for DNS-01 challenges
- Container names are the DNS names — `gpu` must match what `platform-api` expects

## Flat Single-Host Compose

All services on one Docker network. Defined in `wopr-ops/docker-compose.local.yml`.

GPU services use compose profiles to manage VRAM and avoid starting heavy inference models unless needed:

```bash
# Minimal: platform services only (fast)
docker compose -f docker-compose.local.yml up -d

# With LLM inference
docker compose -f docker-compose.local.yml --profile llm up -d

# With voice (whisper + chatterbox)
docker compose -f docker-compose.local.yml --profile voice up -d

# Full stack
docker compose -f docker-compose.local.yml --profile llm --profile voice up -d
```

### When to use flat

- Running vitest and integration tests
- Application-level feature development on platform-api or platform-ui
- Rapid iteration where GPU services aren't involved

## Choosing Between Them

| Testing | Use |
|---------|-----|
| Deploy scripts | DinD topology |
| Network routing changes | DinD topology |
| Credential propagation | DinD topology |
| New service provisioning | DinD topology |
| Application-level dev | Flat compose |
| Running test suite | Flat compose |
| GPU model changes (VRAM limits) | Flat compose with profiles |

## Local Caddy

`wopr-ops/Caddyfile.local` configures Caddy for local development with `localhost` domains and self-signed certs:

```
localhost:443 {
  reverse_proxy platform-api:3000
}
```

For TLS in local dev, Caddy uses its local CA. Run `caddy trust` once to install it in the system trust store.

## See Also

- [wopr/devops/operations.md](./operations.md) — the operations tested locally before production
- [wopr/devops/wopr-ops-structure.md](./wopr-ops-structure.md) — where compose files and local/ configs live
