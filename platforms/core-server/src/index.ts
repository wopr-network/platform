import { resolveSecrets } from "@wopr-network/platform-core/config";
import { logger } from "@wopr-network/platform-core/config/logger";
import { bootPlatformServer } from "@wopr-network/platform-core/server";

const slug = process.env.PRODUCT_SLUG ?? "wopr";
const vaultSecrets = await resolveSecrets(slug);

// Merge env vars as fallback — container gets secrets via .env, not Vault directly
const secrets = {
  ...vaultSecrets,
  dbPassword: vaultSecrets.dbPassword ?? process.env.POSTGRES_PASSWORD,
  stripeSecretKey: vaultSecrets.stripeSecretKey ?? process.env.STRIPE_SECRET_KEY,
  stripeWebhookSecret: vaultSecrets.stripeWebhookSecret ?? process.env.STRIPE_WEBHOOK_SECRET,
  betterAuthSecret: vaultSecrets.betterAuthSecret ?? process.env.BETTER_AUTH_SECRET,
  cryptoServiceKey: vaultSecrets.cryptoServiceKey ?? process.env.CRYPTO_SERVICE_KEY,
  cryptoServiceUrl: vaultSecrets.cryptoServiceUrl ?? process.env.CRYPTO_SERVICE_URL,
  openrouterApiKey: vaultSecrets.openrouterApiKey ?? process.env.OPENROUTER_API_KEY,
  provisionSecret: vaultSecrets.provisionSecret ?? process.env.PROVISION_SECRET,
  githubClientId: vaultSecrets.githubClientId ?? process.env.GITHUB_CLIENT_ID,
  githubClientSecret: vaultSecrets.githubClientSecret ?? process.env.GITHUB_CLIENT_SECRET,
  googleClientId: vaultSecrets.googleClientId ?? process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: vaultSecrets.googleClientSecret ?? process.env.GOOGLE_CLIENT_SECRET,
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
    hotPool: false,
  },
  standalone: {
    allowedServiceTokens: process.env.CORE_ALLOWED_SERVICE_TOKENS ?? "",
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
