import { resolveSecrets } from "@wopr-network/platform-core/config";
import { logger } from "@wopr-network/platform-core/config/logger";
import { bootPlatformServer } from "@wopr-network/platform-core/server";
import { resolveVaultConfig, VaultClient } from "@wopr-network/vault-client";

const slug = process.env.PRODUCT_SLUG ?? "wopr";
const vaultSecrets = await resolveSecrets(slug);

// Collect the platform_service_key from every product that talks to core
// (holyship, paperclip, nemoclaw, wopr UIs). Each product's server-to-server
// Authorization header uses this token; core has to include all of them in
// allowedServiceTokens or the tRPC auth middleware rejects the call with
// `Not authorized for this tenant` even though the service-auth path should
// short-circuit on platform_admin role. Currently `.env` on the VPS is the
// only source, and it drifted away from Vault (observed on holyship: invocation
// b63d41e9 failed with `provision: Not authorized for this tenant` while the
// Vault-sourced platform_service_key would have matched).
async function readVaultServiceTokens(): Promise<string[]> {
  const vaultConfig = resolveVaultConfig();
  if (!vaultConfig) return [];
  const vault = new VaultClient(vaultConfig);
  const products = ["holyship", "paperclip", "nemoclaw"];
  const tokens = await Promise.all(
    products.map(async (p) => {
      try {
        const secret = await vault.read(`${p}/prod`);
        return secret.platform_service_key ?? null;
      } catch {
        return null;
      }
    }),
  );
  return tokens.filter((t): t is string => !!t);
}

const vaultServiceTokens = await readVaultServiceTokens();

// Merge env vars as fallback — container gets secrets via .env, not Vault directly
// Merge env vars as fallback — container gets secrets via .env, not Vault directly.
// Convert undefined → null to match PlatformSecrets types.
const env = (key: string): string | null => process.env[key] ?? null;
const secrets = {
  ...vaultSecrets,
  dbPassword: vaultSecrets.dbPassword ?? env("POSTGRES_PASSWORD") ?? "changeme",
  stripeSecretKey: vaultSecrets.stripeSecretKey ?? env("STRIPE_SECRET_KEY"),
  stripeWebhookSecret: vaultSecrets.stripeWebhookSecret ?? env("STRIPE_WEBHOOK_SECRET"),
  betterAuthSecret: vaultSecrets.betterAuthSecret ?? env("BETTER_AUTH_SECRET") ?? "",
  cryptoServiceKey: vaultSecrets.cryptoServiceKey ?? env("CRYPTO_SERVICE_KEY"),
  cryptoServiceUrl: vaultSecrets.cryptoServiceUrl ?? env("CRYPTO_SERVICE_URL"),
  openrouterApiKey: vaultSecrets.openrouterApiKey ?? env("OPENROUTER_API_KEY"),
  provisionSecret: vaultSecrets.provisionSecret ?? env("PROVISION_SECRET"),
  githubClientId: vaultSecrets.githubClientId ?? env("GITHUB_CLIENT_ID"),
  githubClientSecret: vaultSecrets.githubClientSecret ?? env("GITHUB_CLIENT_SECRET"),
  googleClientId: vaultSecrets.googleClientId ?? env("GOOGLE_CLIENT_ID"),
  googleClientSecret: vaultSecrets.googleClientSecret ?? env("GOOGLE_CLIENT_SECRET"),
};

const dbHost = process.env.DB_HOST ?? "postgres";
const dbName = process.env.DB_NAME ?? "platform";
const dbPort = process.env.DB_PORT ?? "5432";
const databaseUrl =
  process.env.DATABASE_URL ??
  `postgresql://core:${encodeURIComponent(secrets.dbPassword ?? "changeme")}@${dbHost}:${dbPort}/${dbName}`;

const platform = await bootPlatformServer({
  slug,
  secrets,
  databaseUrl,
  host: process.env.HOST ?? "0.0.0.0",
  port: Number(process.env.PORT ?? 3001),
  features: {
    fleet: true,
    crypto: !!secrets.cryptoServiceKey,
    stripe: !!secrets.stripeSecretKey,
    gateway: true,
    hotPool: true,
    // Chat is shared across all products on this core-server. Nemoclaw
    // is the primary consumer (multi-agent chat UI); other products
    // that don't need it simply don't call the endpoints.
    chat: true,
  },
  standalone: {
    // Combine .env tokens with every product's Vault-sourced
    // platform_service_key so drift between .env and Vault doesn't block
    // engine→core service calls. Deduplicate, filter empties.
    allowedServiceTokens: Array.from(
      new Set(
        [
          ...(process.env.CORE_ALLOWED_SERVICE_TOKENS ?? "").split(",").map((t) => t.trim()),
          ...vaultServiceTokens,
        ].filter(Boolean),
      ),
    ).join(","),
  },
  auth: {
    secret: secrets.betterAuthSecret ?? process.env.BETTER_AUTH_SECRET ?? "",
    socialProviders: {
      ...(secrets.githubClientId && secrets.githubClientSecret
        ? { github: { clientId: secrets.githubClientId, clientSecret: secrets.githubClientSecret } }
        : {}),
      ...(secrets.googleClientId && secrets.googleClientSecret
        ? { google: { clientId: secrets.googleClientId, clientSecret: secrets.googleClientSecret } }
        : {}),
    },
  },
});

logger.info(`Core server starting on port ${process.env.PORT ?? 3001}`);
await platform.start();

const shutdown = () =>
  platform
    .stop()
    .catch((err) => logger.error("Shutdown error", { error: err }))
    .finally(() => process.exit(0));
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
