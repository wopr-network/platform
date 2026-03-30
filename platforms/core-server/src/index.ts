import { resolveSecrets } from "@wopr-network/platform-core/config";
import { logger } from "@wopr-network/platform-core/config/logger";
import { bootPlatformServer } from "@wopr-network/platform-core/server";

const slug = process.env.PRODUCT_SLUG ?? "core";
const secrets = await resolveSecrets(slug);

const dbHost = process.env.DB_HOST ?? "postgres";
const dbName = process.env.DB_NAME ?? "platform";
const dbPort = process.env.DB_PORT ?? "5432";
const databaseUrl =
  process.env.DATABASE_URL ?? `postgresql://core:${secrets.dbPassword}@${dbHost}:${dbPort}/${dbName}`;

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

process.on("SIGINT", () => platform.stop().then(() => process.exit(0)));
process.on("SIGTERM", () => platform.stop().then(() => process.exit(0)));
