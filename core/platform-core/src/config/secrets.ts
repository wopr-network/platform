/**
 * Typed secrets resolved from Vault (or env fallback in local dev).
 *
 * Every secret the platform needs is here. No process.env reads for
 * secrets anywhere else in the codebase.
 */

export interface PlatformSecrets {
  // Auth
  betterAuthSecret: string;
  platformSecret: string;
  platformEncryptionSecret: string;

  // Database
  dbPassword: string;

  // Stripe
  stripeSecretKey: string | null;
  stripeWebhookSecret: string | null;
  stripePublishableKey: string | null;

  // Email
  postmarkApiKey: string | null;
  resendApiKey: string | null;

  // AI
  openrouterApiKey: string | null;

  // Infrastructure
  doApiToken: string | null;
  ghcrToken: string | null;

  // GitHub App
  githubClientId: string | null;
  githubClientSecret: string | null;
  githubAppPrivateKey: string | null;
  githubWebhookSecret: string | null;

  // Cloudflare (DNS tokens used by Caddy and provisioning)
  cloudflareDnsToken: string | null;
  cloudflareTunnelToken: string | null;
  /** Scoped CF token for Caddy wildcard TLS (Zone:Read + DNS:Edit). */
  cloudflareCaddyDnsToken: string | null;

  // Crypto
  cryptoServiceKey: string | null;
  cryptoServiceUrl: string | null;

  // OAuth (Google social login)
  googleClientId: string | null;
  googleClientSecret: string | null;

  // Fleet
  provisionSecret: string;

  // Registry (private Docker registry for sidecar images)
  registryUsername: string | null;
  registryPassword: string | null;
  registryUrl: string | null;

  // DB-as-channel queue: shared password for the wopr_agent Postgres role.
  // Set at boot by ensureAgentLoginRolePassword. Null in dev/local where
  // the agent queue worker isn't enabled.
  agentDbPassword: string | null;
}

/**
 * Map raw Vault key-value data to typed PlatformSecrets.
 * Vault paths are merged into one flat Record<string, string>.
 */
export function mapSecrets(raw: Record<string, string>): PlatformSecrets {
  return {
    // Auth
    betterAuthSecret: required(raw, "better_auth_secret"),
    platformSecret: required(raw, "platform_secret"),
    platformEncryptionSecret: required(raw, "platform_encryption_secret"),

    // Database
    dbPassword: required(raw, "db_password"),

    // Stripe
    stripeSecretKey: raw.secret_key ?? null,
    stripeWebhookSecret: raw.webhook_secret ?? null,
    stripePublishableKey: raw.publishable_key ?? null,

    // Email
    postmarkApiKey: raw.server_token ?? null,
    resendApiKey: raw.resend_api_key ?? null,

    // AI
    openrouterApiKey: raw.api_key ?? null,

    // Infrastructure
    doApiToken: raw.api_token ?? null,
    ghcrToken: raw.token ?? null,

    // GitHub App
    githubClientId: raw.client_id ?? null,
    githubClientSecret: raw.client_secret ?? null,
    githubAppPrivateKey: raw.private_key ?? null,
    githubWebhookSecret: raw.webhook_secret ?? null,

    // Cloudflare
    cloudflareDnsToken: raw.dns_edit ?? null,
    cloudflareTunnelToken: raw.tunnel_edit ?? null,
    cloudflareCaddyDnsToken: raw.caddy_dns_token ?? null,

    // Crypto
    cryptoServiceKey: raw.crypto_service_key ?? null,
    cryptoServiceUrl: raw.crypto_service_url ?? null,

    // OAuth
    googleClientId: raw.google_client_id ?? null,
    googleClientSecret: raw.google_client_secret ?? null,

    // Fleet
    provisionSecret: required(raw, "provision_secret"),

    // Registry
    registryUsername: raw.registry_username ?? null,
    registryPassword: raw.registry_password ?? null,
    registryUrl: raw.registry_url ?? null,

    // Queue: shared password for the wopr_agent Postgres role
    agentDbPassword: raw.agent_db_password ?? null,
  };
}

/**
 * Map secrets from individually-read Vault paths.
 * Avoids key collisions (e.g. webhook_secret in both stripe and github).
 */
export function mapSecretsFromPaths(paths: Record<string, Record<string, string>>): PlatformSecrets {
  const prod = paths.prod ?? {};
  const stripe = paths.stripe ?? {};
  const openrouter = paths.openrouter ?? {};
  const postmark = paths.postmark ?? {};
  const digitalocean = paths.digitalocean ?? {};
  const github = paths.github ?? {};
  const ghcr = paths.ghcr ?? {};
  const cloudflare = paths.cloudflare ?? {};
  const registry = paths.registry ?? {};

  return {
    betterAuthSecret: requireFrom(prod, "better_auth_secret"),
    platformSecret: requireFrom(prod, "platform_secret"),
    platformEncryptionSecret: requireFrom(prod, "platform_encryption_secret"),
    dbPassword: requireFrom(prod, "db_password"),
    stripeSecretKey: stripe.secret_key ?? null,
    stripeWebhookSecret: stripe.webhook_secret ?? null,
    stripePublishableKey: stripe.publishable_key ?? null,
    postmarkApiKey: postmark.server_token ?? null,
    resendApiKey: paths.resend?.api_key ?? null,
    openrouterApiKey: openrouter.api_key ?? null,
    doApiToken: digitalocean.api_token ?? null,
    ghcrToken: ghcr.token ?? null,
    githubClientId: prod.github_client_id ?? github.client_id ?? null,
    githubClientSecret: prod.github_client_secret ?? github.client_secret ?? null,
    githubAppPrivateKey: github.private_key ?? null,
    githubWebhookSecret: github.webhook_secret ?? null,
    cloudflareDnsToken: cloudflare.dns_edit ?? null,
    cloudflareTunnelToken: cloudflare.tunnel_edit ?? null,
    cloudflareCaddyDnsToken: cloudflare.caddy_dns_token ?? null,
    cryptoServiceKey: prod.crypto_service_key ?? null,
    cryptoServiceUrl: prod.crypto_service_url ?? null,
    googleClientId: prod.google_client_id ?? null,
    googleClientSecret: prod.google_client_secret ?? null,
    provisionSecret: requireFrom(prod, "provision_secret"),
    registryUsername: registry.username ?? null,
    registryPassword: registry.password ?? null,
    registryUrl: registry.url ?? null,
    agentDbPassword: prod.agent_db_password ?? null,
  };
}

function requireFrom(raw: Record<string, string>, key: string): string {
  const val = raw[key];
  if (!val) throw new Error(`Missing required secret: ${key}`);
  return val;
}

function required(raw: Record<string, string>, key: string): string {
  const val = raw[key];
  if (!val) throw new Error(`Missing required secret: ${key}`);
  return val;
}

/**
 * Dev-only fallback when VAULT_ADDR is not set.
 * Returns dummy defaults — zero process.env reads.
 * For real secrets in dev, point VAULT_ADDR at a local Vault.
 */
export function secretsFromEnv(): PlatformSecrets {
  return {
    betterAuthSecret: "dev-secret-minimum-32-characters-long",
    platformSecret: "dev-secret-minimum-32-characters-long",
    platformEncryptionSecret: "dev-secret-minimum-32-characters-long",
    dbPassword: "",
    stripeSecretKey: null,
    stripeWebhookSecret: null,
    stripePublishableKey: null,
    postmarkApiKey: null,
    resendApiKey: null,
    openrouterApiKey: null,
    doApiToken: null,
    ghcrToken: null,
    githubClientId: null,
    githubClientSecret: null,
    githubAppPrivateKey: null,
    githubWebhookSecret: null,
    cloudflareDnsToken: null,
    cloudflareTunnelToken: null,
    cloudflareCaddyDnsToken: null,
    cryptoServiceKey: null,
    cryptoServiceUrl: null,
    googleClientId: null,
    googleClientSecret: null,
    provisionSecret: "dev-provision-secret",
    registryUsername: null,
    registryPassword: null,
    registryUrl: null,
    agentDbPassword: null,
  };
}
// vault oauth rebuild
