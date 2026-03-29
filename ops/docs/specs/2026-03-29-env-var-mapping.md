# Environment Variable Migration Map

**Status:** COMPLETE — all secrets eliminated from process.env as of 2026-03-29.

Every `process.env.*` read in platform-core, mapped to its destination.

**Legend:**
- **V** = Vault `secret/<product>/prod`
- **DB** = `product_config` table (admin-editable)
- **BC** = `BootConfig` (passed by product at boot, from Vault)
- **R** = Derived at runtime (no storage)
- **C** = Compose-level (non-secret infra config)
- **X** = Remove (dead code, unused, or dev-only)

## Auth & Signing Secrets → Vault

| Env Var | Destination | BootConfig Field | Notes |
|---------|-------------|------------------|-------|
| `BETTER_AUTH_SECRET` | **V** | `auth.secret` | Signs session tokens. Rotation invalidates all sessions. |
| `PLATFORM_ENCRYPTION_SECRET` | **V** | `auth.encryptionSecret` | Encrypts at-rest data. Rotation requires re-encryption migration. |
| `PLATFORM_SECRET` | **V** | `auth.platformSecret` | Internal service auth. |
| `PROVISION_SECRET` | **V** → **BC** | `provisionSecret` | Already in BootConfig. |

## Payment Providers → Vault

| Env Var | Destination | BootConfig Field | Notes |
|---------|-------------|------------------|-------|
| `STRIPE_SECRET_KEY` | **V** → **BC** | `stripeSecretKey` | Already in BootConfig. |
| `STRIPE_WEBHOOK_SECRET` | **V** → **BC** | `stripeWebhookSecret` | Already in BootConfig. |
| `CRYPTO_SERVICE_KEY` | **V** → **BC** | `cryptoServiceKey` | Already in BootConfig. |
| `CRYPTO_SERVICE_URL` | **DB** | — | Endpoint, not a secret. |

## Stripe Config (non-secret) → DB

| Env Var | Destination | Notes |
|---------|-------------|-------|
| `STRIPE_DEFAULT_PRICE_ID` | **DB** | Price IDs are public Stripe identifiers. |
| `STRIPE_CREDIT_PRICE_5` | **DB** | |
| `STRIPE_CREDIT_PRICE_10` | **DB** | |
| `STRIPE_CREDIT_PRICE_25` | **DB** | |
| `STRIPE_CREDIT_PRICE_50` | **DB** | |
| `STRIPE_CREDIT_PRICE_100` | **DB** | |

## Email → Vault (tokens) + DB (config)

| Env Var | Destination | Notes |
|---------|-------------|-------|
| `POSTMARK_API_KEY` | **V** | The one that got us here. |
| `RESEND_API_KEY` | **V** | |
| `AWS_ACCESS_KEY_ID` | **V** | SES credentials. |
| `AWS_SECRET_ACCESS_KEY` | **V** | |
| `AWS_SES_REGION` | **DB** | Config, not secret. |
| `EMAIL_FROM` | **DB** | Already in product_config. |
| `EMAIL_REPLY_TO` | **DB** | Already in product_config. |
| `EMAIL_DISABLED` | **DB** | Feature flag. |
| `SKIP_EMAIL_VERIFICATION` | **DB** | Feature flag. |
| `RESEND_FROM_EMAIL` | **DB** | |
| `RESEND_FROM` | **DB** | |

## AI Providers → Vault (keys) + DB (config)

| Env Var | Destination | Notes |
|---------|-------------|-------|
| `OPENROUTER_API_KEY` | **V** | |
| `OPENROUTER_BASE_URL` | **DB** | Default: `https://openrouter.ai/api/v1` |
| `DEEPSEEK_API_KEY` | **V** | |
| `GEMINI_API_KEY` | **V** | |
| `KIMI_API_KEY` | **V** | |
| `MINIMAX_API_KEY` | **V** | |
| `ANTHROPIC_API_URL` | **DB** | |
| `OPENAI_API_URL` | **DB** | |
| `GOOGLE_API_URL` | **DB** | |
| `DISCORD_API_URL` | **DB** | |
| `ELEVENLABS_API_KEY` | **V** | |
| `ELEVENLABS_API_URL` | **DB** | |
| `DEEPGRAM_API_KEY` | **V** | |
| `DEEPGRAM_API_URL` | **DB** | |
| `NANO_BANANA_API_KEY` | **V** | |
| `REPLICATE_API_TOKEN` | **V** | |
| `CHATTERBOX_BASE_URL` | **DB** | |
| `OLLAMA_BASE_URL` | **DB** | |

## GitHub App → Vault

| Env Var | Destination | Notes |
|---------|-------------|-------|
| `GITHUB_CLIENT_ID` | **DB** | Public OAuth client ID. |
| `GITHUB_CLIENT_SECRET` | **V** | |
| `GITHUB_WEBHOOK_SECRET` | **V** | |
| `GITHUB_APP_PRIVATE_KEY` | **V** | Multi-line PEM. |
| `GITHUB_APP_ID` | **DB** | Public app ID. |

## OAuth Providers → Vault (secrets) + DB (client IDs)

| Env Var | Destination | Notes |
|---------|-------------|-------|
| `GOOGLE_CLIENT_ID` | **DB** | Public. |
| `GOOGLE_CLIENT_SECRET` | **V** | |
| `DISCORD_CLIENT_ID` | **DB** | Public. |
| `DISCORD_CLIENT_SECRET` | **V** | |

## Infrastructure → Vault

| Env Var | Destination | Notes |
|---------|-------------|-------|
| `DO_API_TOKEN` | **V** | DigitalOcean — can create/destroy droplets. |
| `CLOUDFLARE_API_TOKEN` | **V** | DNS control. |
| `REGISTRY_PASSWORD` | **V** | GHCR push access. |
| `REGISTRY_USERNAME` | **DB** | Public. |
| `REGISTRY_SERVER` | **DB** | Public (`ghcr.io`). |
| `GHCR_TOKEN` | **V** | Same as REGISTRY_PASSWORD usually. |
| `BACKUP_ENCRYPTION_KEY` | **V** | |

## Database → Vault + Compose

| Env Var | Destination | Notes |
|---------|-------------|-------|
| `DATABASE_URL` | **V** (password) + **C** (host/db) | Compose provides host/port/db. Vault provides password. Boot assembles the URL. |
| `POSTGRES_PASSWORD` | **V** | Compose passes to postgres container. Vault agent renders it. |

## Fleet & Provisioning → DB + Vault

| Env Var | Destination | Notes |
|---------|-------------|-------|
| `DO_DEFAULT_REGION` | **DB** | |
| `DO_DEFAULT_SIZE` | **DB** | |
| `DO_GPU_DEFAULT_REGION` | **DB** | |
| `DO_GPU_DEFAULT_SIZE` | **DB** | |
| `DO_SSH_KEY_ID` | **DB** | |
| `GPU_NODE_SECRET` | **V** | |
| `NODE_SECRET` | **V** | |
| `WOPR_NODE_SECRET` | **V** | |
| `FLEET_IMAGE_ALLOWLIST` | **DB** | |
| `FLEET_TEMPLATES_DIR` | **C** | Filesystem path. |
| `WOPR_BIN` | **C** | |
| `WOPR_BOT_IMAGE` | **DB** | |
| `SHARED_NODE_MODULES_ENABLED` | **DB** | |
| `SHARED_NODE_MODULES_MOUNT` | **C** | |
| `SHARED_NODE_MODULES_VOLUME` | **C** | |

## Domain & Routing → DB (mostly already there)

| Env Var | Destination | Notes |
|---------|-------------|-------|
| `COOKIE_DOMAIN` | **DB** | Already in product_config. |
| `UI_ORIGIN` | **DB** | Already in product_config. |
| `PLATFORM_DOMAIN` | **DB** | Already in product_config. |
| `PLATFORM_URL` | **R** | Derive from domain. |
| `PLATFORM_UI_URL` | **R** | Derive from domain. |
| `BETTER_AUTH_URL` | **R** | = `https://api.<domain>` |
| `EXTRA_ALLOWED_REDIRECT_ORIGINS` | **DB** | |
| `TRUSTED_PROXY_IPS` | **C** | Network config. |

## Crypto / Chain → Vault + DB

| Env Var | Destination | Notes |
|---------|-------------|-------|
| `BITCOIND_RPC_PASSWORD` | **V** | |
| `BITCOIND_RPC_URL` | **DB** | |
| `BITCOIND_RPC_USER` | **DB** | |
| `BITCOIND_NETWORK` | **DB** | |
| `EVM_RPC_ETHEREUM` | **DB** | Public RPC endpoints. |
| `EVM_RPC_BASE` | **DB** | |
| `EVM_RPC_POLYGON` | **DB** | |
| `EVM_RPC_ARBITRUM` | **DB** | |

## Operational → Compose

| Env Var | Destination | Notes |
|---------|-------------|-------|
| `NODE_ENV` | **C** | Always `production` in compose. |
| `PORT` | **C** | |
| `LOG_LEVEL` | **C** | |
| `NODE_ID` | **C** | |
| `HEARTBEAT_INTERVAL_MS` | **C** | |
| `METER_WAL_PATH` | **C** | Filesystem path. |
| `METER_DLQ_PATH` | **C** | Filesystem path. |
| `METER_MAX_RETRIES` | **C** | |
| `BACKUP_DIR` | **C** | |
| `SNAPSHOT_DIR` | **C** | |
| `CREDENTIALS_PATH` | **C** | |
| `TENANT_ID` | **C** | |
| `S3_BUCKET` | **DB** | |

## Onboarding → DB

| Env Var | Destination | Notes |
|---------|-------------|-------|
| `ONBOARDING_ENABLED` | **DB** | Feature flag. |
| `ONBOARDING_LLM_MODEL` | **DB** | |
| `ONBOARDING_LLM_PROVIDER` | **DB** | |
| `ONBOARDING_WOPR_DATA_DIR` | **C** | |
| `ONBOARDING_WOPR_PORT` | **C** | |

## Affiliate → DB

| Env Var | Destination | Notes |
|---------|-------------|-------|
| `AFFILIATE_BASE_URL` | **DB** | |
| `AFFILIATE_MATCH_RATE` | **DB** | |
| `AFFILIATE_MAX_MATCH_CREDITS_30D` | **DB** | |
| `AFFILIATE_MAX_REFERRALS_30D` | **DB** | |
| `AFFILIATE_NEW_USER_BONUS_RATE` | **DB** | |
| `DIVIDEND_MATCH_RATE` | **DB** | |

## Escalation → DB

| Env Var | Destination | Notes |
|---------|-------------|-------|
| `ESCALATION_CTO_EMAIL` | **DB** | |
| `ESCALATION_CTO_PHONE` | **DB** | |
| `ESCALATION_PAGERDUTY_SERVICE` | **DB** | |
| `ESCALATION_SLACK_CHANNEL` | **DB** | |
| `ADMIN_WEBHOOK_URL` | **DB** | |

## Margin Config → DB

| Env Var | Destination | Notes |
|---------|-------------|-------|
| `MARGIN_CONFIG_JSON` | **DB** | Already JSON — natural fit for product_config. |
| `ALLOW_PRIVATE_NODE_HOSTS` | **DB** | |

## Remove (dev-only or dead)

| Env Var | Action | Notes |
|---------|--------|-------|
| `REGISTRATION_TOKEN` | **X** | Legacy. |

## Summary

| Destination | Count | Description |
|-------------|-------|-------------|
| **Vault** | ~30 | API keys, signing secrets, passwords, private keys |
| **DB** | ~55 | Config, feature flags, pricing, URLs, client IDs |
| **Compose** | ~18 | Infra paths, ports, NODE_ENV, filesystem mounts |
| **Runtime** | ~5 | Derived from hostname or domain |
| **Remove** | ~1 | Dead code |

## BootConfig Changes

Current `BootConfig` already accepts some secrets. Extend it to accept all Vault secrets:

```typescript
interface BootConfig {
  slug: string;
  features: FeatureFlags;

  // Vault secrets (fetched by VaultConfigProvider before boot)
  secrets: {
    databasePassword: string;
    betterAuthSecret: string;
    platformEncryptionSecret: string;
    stripeSecretKey?: string;
    stripeWebhookSecret?: string;
    cryptoServiceKey?: string;
    provisionSecret: string;
    postmarkApiKey?: string;
    awsAccessKeyId?: string;
    awsSecretAccessKey?: string;
    openrouterApiKey?: string;
    doApiToken?: string;
    registryPassword?: string;
    backupEncryptionKey?: string;
    githubClientSecret?: string;
    githubAppPrivateKey?: string;
    githubWebhookSecret?: string;
    googleClientSecret?: string;
    discordClientSecret?: string;
    gpuNodeSecret?: string;
    nodeSecret?: string;
  };

  // Compose-level (non-secret, from Docker env)
  infra: {
    databaseHost: string;  // default: "postgres"
    databaseName: string;  // default: "<slug>_platform"
    port?: number;
    host?: string;
    meterWalPath?: string;
    meterDlqPath?: string;
    nodeEnv?: string;
  };

  // Everything else comes from DB (product_config)
  // queried after DB connection is established using slug
  routes?: RoutePlugin[];
}
```

Boot sequence becomes:
```
1. Read VAULT_ADDR + role_id from compose env (only 2 values)
2. VaultConfigProvider.fetch("paperclip/prod") → secrets object
3. Connect to DB using secrets.databasePassword + infra.databaseHost
4. Load product_config from DB using slug
5. Build DI container with secrets + db config + infra
6. Wire routes, start server
```
