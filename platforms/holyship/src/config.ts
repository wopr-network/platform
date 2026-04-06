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

  // Engine database (holyship's own tables — flows, entities, gates, events)
  DATABASE_URL: z.string().min(1),

  // Core server — holyship delegates auth, billing, credits, org, fleet to core
  CORE_URL: z.string().url().default("http://core:3001"),
  CORE_SERVICE_TOKEN: z.string().min(1),

  // UI
  UI_ORIGIN: z.string().default("https://holyship.wtf"),
  APP_BASE_URL: z.string().url().default("https://api.holyship.wtf"),

  // GitHub App (holyship's own integration — not delegated to core)
  GITHUB_APP_ID: optStr,
  GITHUB_APP_PRIVATE_KEY: optStr,
  GITHUB_WEBHOOK_SECRET: optStr,

  // Worker/admin auth tokens
  HOLYSHIP_ADMIN_TOKEN: optStr,
  HOLYSHIP_WORKER_TOKEN: optStr,

  // Fleet — holyship tells core to provision holyshipper containers
  HOLYSHIP_WORKER_IMAGE: optStr,
  HOLYSHIP_GATEWAY_KEY: optStr,
  DOCKER_NETWORK: optStr,

  // Platform service key for holyship → core gateway calls (e.g. flow editing)
  HOLYSHIP_PLATFORM_SERVICE_KEY: optStr,
});

export type Config = z.infer<typeof envSchema>;

let _config: Config | undefined;

export function getConfig(): Config {
  if (!_config) {
    _config = envSchema.parse(process.env);
  }
  return _config;
}
