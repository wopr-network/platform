# Vault Secrets Migration

**Date:** 2026-03-29
**Status:** COMPLETE (all 4 products live)
**Trigger:** Postmark token leaked via committed .env.production in public wopr-ops repo. 10K phishing emails sent. Full credential compromise across all products.

## Architecture

```
┌─────────────────────┐
│  Vault Server        │  ← Single source of truth
│  vault.wopr.bot      │  ← Chain-server VPS 167.71.118.221
│  Raft storage        │  ← /opt/vault/data
│  Caddy TLS           │  ← Auto-unseal via systemd
└──────────┬──────────┘
           │ AppRole auth (per-product isolation)
           ├───────────────┬───────────────┬───────────────┐
           │               │               │               │
    ┌──────┴──────┐ ┌─────┴──────┐ ┌─────┴──────┐ ┌─────┴──────┐
    │  Paperclip   │ │   WOPR     │ │  Holyship  │ │  NemoClaw  │
    │  68.183.*    │ │  138.68.*  │ │  138.68.*  │ │  167.172.* │
    │              │ │            │ │            │ │            │
    │ vault-role   │ │ vault-role │ │ vault-role │ │ vault-role │
    │ zero .env    │ │ zero .env  │ │ zero .env  │ │ zero .env  │
    └──────────────┘ └────────────┘ └────────────┘ └────────────┘
```

## Vault Secret Paths

| Path | Contents |
|------|----------|
| `secret/<slug>/prod` | `better_auth_secret`, `platform_secret`, `platform_encryption_secret`, `db_password`, `provision_secret`, `crypto_service_key`, `crypto_service_url`, `google_client_secret` |
| `secret/<slug>/stripe` | `publishable_key`, `secret_key`, `webhook_secret` |
| `secret/shared/openrouter` | `api_key` |
| `secret/shared/resend` | `api_key` |
| `secret/shared/postmark` | `server_token` (legacy — switched to Resend) |
| `secret/shared/digitalocean` | `api_token` |
| `secret/shared/github` | `app_id`, `client_id`, `client_secret`, `private_key`, `webhook_secret` |
| `secret/shared/ghcr` | `token` |
| `secret/shared/cloudflare` | `dns_edit`, `ssl_edit`, `cache_purge`, `page_rules`, `firewall_edit`, `lb_edit`, `workers_edit`, `r2_edit`, `email_routing`, `tunnel_edit`, `access_edit`, `analytics_read` |

## AppRoles

| Product | Role ID | Policy |
|---------|---------|--------|
| paperclip | `31d7b636-...` | read `secret/data/paperclip/*`, `secret/data/shared/*` |
| wopr | `ccdf088b-...` | read `secret/data/wopr/*`, `secret/data/shared/*` |
| holyship | `249bb12b-...` | read `secret/data/holyship/*`, `secret/data/shared/*` |
| nemoclaw | `c7c537b6-...` | read `secret/data/nemoclaw/*`, `secret/data/shared/*` |
| chain-server | `740ff1f7-...` | read `secret/data/chain-server/*` (NOT MIGRATED — internal only) |

## Code Architecture

### Boot Sequence (all products)

```
resolveSecrets(slug)
  ├─ VAULT_ADDR set? → VaultConfigProvider.read() per path → mapSecretsFromPaths()
  └─ not set? → dev defaults (no process.env reads)
      ↓
  PlatformSecrets object
      ↓
  bootPlatformServer({ secrets, ... })
      ↓
  buildContainer() → uses secrets for Stripe, gateway, etc.
  mountRoutes() → uses secrets.openrouterApiKey for gateway
  getEmailClient({ resendApiKey: secrets.resendApiKey }) → Resend
  initBetterAuth({ secret: secrets.betterAuthSecret }) → auth
```

### Key Design Decisions

1. **No process.env for secrets** — eliminated entirely from platform-core. Dev fallback returns dummy values; real secrets require Vault even in dev/staging.

2. **Per-path Vault reads** — `readAll()` merged paths into a flat map, causing `webhook_secret` collision between Stripe and GitHub. Now reads each path individually via `mapSecretsFromPaths()`.

3. **WOPR singleton bridge** — WOPR's 56-singleton architecture uses `initPool(url)`, `initSecrets(secrets)`, `initDOClient(token)` called at boot before any lazy getter fires. No env injection.

4. **Resend replaces Postmark** — Postmark account compromised. Resend API key in `shared/resend`. 4 domains verified: runpaperclip.com, wopr.bot, holyship.wtf, nemopod.com.

5. **Chain server stays on .env** — internal-only RPC passwords between Docker containers on the same box. No Vault needed.

### Compose Pattern (Vault-integrated)

```yaml
platform-api:
  environment:
    - VAULT_ADDR=https://vault.wopr.bot
    - VAULT_ROLE_ID=${VAULT_ROLE_ID}
    - VAULT_SECRET_ID=${VAULT_SECRET_ID}
    - DB_HOST=postgres
    - DB_NAME=<product>_platform
    - NODE_ENV=production
    # Zero secrets. Only Vault address + AppRole credentials + infra config.
```

### VPS .env (minimal)

```bash
# Only non-secrets remain
POSTGRES_PASSWORD=<matches Vault db_password>
VAULT_ROLE_ID=<from vault-role file>
VAULT_SECRET_ID=<from vault-role file>
# Product-specific deployment config (tokens, price IDs)
```

## Recovery

- **Unseal key + root token**: encrypted at `/mnt/g/My Drive/vault/vault-recovery.gpg`
- **Auto-unseal**: systemd service at `/etc/systemd/system/vault-unseal.service`
- **Emergency**: SSH to VPS, Vault is fail-closed (no boot without it)

## Files Changed

### platform-core
- `src/config/vault-provider.ts` — VaultConfigProvider class
- `src/config/secrets.ts` — PlatformSecrets interface, mapSecretsFromPaths()
- `src/config/resolve-secrets.ts` — resolveSecrets() entry point
- `src/auth/better-auth.ts` — no env fallbacks for secrets/social providers
- `src/email/client.ts` — Resend primary, Postmark removed, no env reads
- `src/billing/stripe/client.ts` — loadStripeConfig takes explicit params
- `src/billing/crypto/client.ts` — loadCryptoConfig takes explicit params
- `src/server/mount-routes.ts` — openrouterApiKey via MountConfig
- `src/server/index.ts` — bootPlatformServer wires email + gateway from secrets
- `src/fleet/services.ts` — initPool/initDOClient replace env reads
- `src/monetization/adapters/*.ts` — all *FromEnv functions deleted
- `src/monetization/index.ts` — removed *FromEnv exports

### Products
- All 4 `src/index.ts` — call resolveSecrets(), pass secrets to boot + auth
- `wopr-platform/src/fleet/services.ts` — initPool/initSecrets/initDOClient
- `wopr-platform/src/validate-env.ts` — skips secret checks in Vault mode

### Compose/CI
- `ops/vps/*/docker-compose.yml` — secrets replaced with Vault env vars, images from `registry.wopr.bot`
- `.github/workflows/staging.yml` — switched from GHCR to `registry.wopr.bot`, plain `docker build`+`push`
- `.github/workflows/promote.yml` — product-specific service names, `registry.wopr.bot`

## Self-Hosted Container Registry (2026-03-30)

GHCR pushes hung from self-hosted runner due to Docker BuildKit deadlock. Deployed own registry.

| Component | Detail |
|-----------|--------|
| URL | `registry.wopr.bot` |
| Host | chain-server (167.71.118.221) |
| Storage | 100GB DO volume at `/mnt/registry` ($10/mo) |
| Auth | htpasswd, creds in Vault `shared/registry` |
| TLS | Caddy (same instance as Vault) |
| Compose | `/opt/registry/docker-compose.yml` |

All VPS compose files updated from `ghcr.io/wopr-network/` to `registry.wopr.bot/`. CI org secret `REGISTRY_PASSWORD` set.
