import { z } from "zod/v4";

/** Treat empty strings as undefined so Docker Compose blank defaults don't fail min(1). */
const optStr = z
  .string()
  .min(1)
  .optional()
  .or(z.literal("").transform(() => undefined));

const envSchema = z.object({
  // Server
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default("0.0.0.0"),

  // Engine database (built from Vault secrets in production)
  DATABASE_URL: optStr,

  // Core server — holyship delegates auth, billing, credits, org, fleet to core
  CORE_URL: z.string().url().default("http://core:3001"),
  // Optional: services/core-client.ts prefers Vault holyship/prod.platform_service_key
  // and falls back to this env var. Keep it optional so Vault-only deployments
  // (no .env token) can still boot.
  CORE_SERVICE_TOKEN: optStr,

  // UI
  UI_ORIGIN: z.string().default("https://holyship.wtf"),
  APP_BASE_URL: z.string().url().default("https://api.holyship.wtf"),

  // Worker container image (not a secret)
  HOLYSHIP_WORKER_IMAGE: optStr,
  DOCKER_NETWORK: optStr,
});

export type Config = z.infer<typeof envSchema>;

let _config: Config | undefined;

export function getConfig(): Config {
  if (!_config) {
    _config = envSchema.parse(process.env);
  }
  return _config;
}
