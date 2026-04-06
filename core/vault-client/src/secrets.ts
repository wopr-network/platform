/**
 * Typed secrets resolved from Vault (or dev defaults in local dev).
 *
 * Every secret the platform needs is here. No process.env reads for
 * secrets anywhere else in the codebase.
 */

export interface PlatformSecrets {
  betterAuthSecret: string;
  platformSecret: string;
  platformEncryptionSecret: string;
  dbPassword: string;
  stripeSecretKey: string | null;
  stripeWebhookSecret: string | null;
  stripePublishableKey: string | null;
  postmarkApiKey: string | null;
  resendApiKey: string | null;
  openrouterApiKey: string | null;
  doApiToken: string | null;
  ghcrToken: string | null;
  githubClientId: string | null;
  githubClientSecret: string | null;
  githubAppPrivateKey: string | null;
  githubWebhookSecret: string | null;
  cloudflareDnsToken: string | null;
  cloudflareTunnelToken: string | null;
  cloudflareCaddyDnsToken: string | null;
  cryptoServiceKey: string | null;
  cryptoServiceUrl: string | null;
  googleClientId: string | null;
  googleClientSecret: string | null;
  provisionSecret: string;
  registryUsername: string | null;
  registryPassword: string | null;
  registryUrl: string | null;
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
  };
}

function requireFrom(raw: Record<string, string>, key: string): string {
  const val = raw[key];
  if (!val) throw new Error(`Missing required secret: ${key}`);
  return val;
}

/**
 * Dev-only fallback when VAULT_ADDR is not set.
 * Returns dummy defaults — zero process.env reads.
 */
export function devSecrets(): PlatformSecrets {
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
  };
}
