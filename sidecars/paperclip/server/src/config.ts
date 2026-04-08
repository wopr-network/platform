import { readConfigFile } from "./config-file.js";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { resolvePaperclipEnvPath } from "./paths.js";
import { maybeRepairLegacyWorktreeConfigAndEnvFiles } from "./worktree-config.js";
import {
  AUTH_BASE_URL_MODES,
  DEPLOYMENT_EXPOSURES,
  DEPLOYMENT_MODES,
  SECRET_PROVIDERS,
  STORAGE_PROVIDERS,
  type AuthBaseUrlMode,
  type DeploymentExposure,
  type DeploymentMode,
  type SecretProvider,
  type StorageProvider,
} from "@paperclipai/shared";
import {
  resolveDefaultBackupDir,
  resolveDefaultEmbeddedPostgresDir,
  resolveDefaultSecretsKeyFilePath,
  resolveDefaultStorageDir,
  resolveHomeAwarePath,
} from "./home-paths.js";

/**
 * Instance config written by the provisioning endpoint and persisted
 * to the data volume.  On first boot of a managed image, the build-time
 * marker at /app/.managed-instance.json provides defaults until
 * provisioning writes the full config.
 */
interface InstanceConfig {
  deploymentMode?: string;
  hostedMode?: boolean;
  deploymentExposure?: string;
}

/** Path on the data volume — survives container restarts. */
const INSTANCE_CONFIG_PATH = resolve(process.env.PAPERCLIP_HOME ?? "/data", ".instance-config.json");

/** Build-time marker baked into Dockerfile.managed — immutable part of the image. */
const MANAGED_MARKER_PATH = "/app/.managed-instance.json";

/**
 * Load deployment identity from persisted config or managed image marker.
 *
 * Priority:
 *   1. Instance config on data volume (written by provision endpoint)
 *   2. Managed image marker (baked into Dockerfile.managed)
 *   3. Empty — self-hosted, uses file config / CLI defaults
 */
function loadInstanceConfig(): InstanceConfig {
  for (const configPath of [INSTANCE_CONFIG_PATH, MANAGED_MARKER_PATH]) {
    try {
      if (existsSync(configPath)) {
        return JSON.parse(readFileSync(configPath, "utf-8"));
      }
    } catch {
      // Ignore parse errors — fall through to next source
    }
  }
  return {};
}

const PAPERCLIP_ENV_FILE_PATH = resolvePaperclipEnvPath();
if (existsSync(PAPERCLIP_ENV_FILE_PATH)) {
  loadDotenv({ path: PAPERCLIP_ENV_FILE_PATH, override: false, quiet: true });
}

const CWD_ENV_PATH = resolve(process.cwd(), ".env");
const isSameFile =
  existsSync(CWD_ENV_PATH) && existsSync(PAPERCLIP_ENV_FILE_PATH)
    ? realpathSync(CWD_ENV_PATH) === realpathSync(PAPERCLIP_ENV_FILE_PATH)
    : CWD_ENV_PATH === PAPERCLIP_ENV_FILE_PATH;
if (!isSameFile && existsSync(CWD_ENV_PATH)) {
  loadDotenv({ path: CWD_ENV_PATH, override: false, quiet: true });
}

maybeRepairLegacyWorktreeConfigAndEnvFiles();

type DatabaseMode = "embedded-postgres" | "postgres";

export interface Config {
  deploymentMode: DeploymentMode;
  deploymentExposure: DeploymentExposure;
  host: string;
  port: number;
  allowedHostnames: string[];
  authBaseUrlMode: AuthBaseUrlMode;
  authPublicBaseUrl: string | undefined;
  authDisableSignUp: boolean;
  databaseMode: DatabaseMode;
  databaseUrl: string | undefined;
  embeddedPostgresDataDir: string;
  embeddedPostgresPort: number;
  databaseBackupEnabled: boolean;
  databaseBackupIntervalMinutes: number;
  databaseBackupRetentionDays: number;
  databaseBackupDir: string;
  serveUi: boolean;
  uiDevMiddleware: boolean;
  secretsProvider: SecretProvider;
  secretsStrictMode: boolean;
  secretsMasterKeyFilePath: string;
  storageProvider: StorageProvider;
  storageLocalDiskBaseDir: string;
  storageS3Bucket: string;
  storageS3Region: string;
  storageS3Endpoint: string | undefined;
  storageS3Prefix: string;
  storageS3ForcePathStyle: boolean;
  feedbackExportBackendUrl: string | undefined;
  feedbackExportBackendToken: string | undefined;
  heartbeatSchedulerEnabled: boolean;
  heartbeatSchedulerIntervalMs: number;
  companyDeletionEnabled: boolean;
  telemetryEnabled: boolean;
}

export function loadConfig(): Config {
  const fileConfig = readConfigFile();
  const fileDatabaseMode = (
    fileConfig?.database.mode === "postgres" ? "postgres" : "embedded-postgres"
  ) as DatabaseMode;

  const fileDbUrl = fileDatabaseMode === "postgres" ? fileConfig?.database.connectionString : undefined;
  const fileDatabaseBackup = fileConfig?.database.backup;
  const fileSecrets = fileConfig?.secrets;
  const fileStorage = fileConfig?.storage;
  const strictModeFromEnv = process.env.PAPERCLIP_SECRETS_STRICT_MODE;
  const secretsStrictMode =
    strictModeFromEnv !== undefined ? strictModeFromEnv === "true" : (fileSecrets?.strictMode ?? false);

  const providerFromEnvRaw = process.env.PAPERCLIP_SECRETS_PROVIDER;
  const providerFromEnv =
    providerFromEnvRaw && SECRET_PROVIDERS.includes(providerFromEnvRaw as SecretProvider)
      ? (providerFromEnvRaw as SecretProvider)
      : null;
  const providerFromFile = fileSecrets?.provider;
  const secretsProvider: SecretProvider = providerFromEnv ?? providerFromFile ?? "local_encrypted";

  const storageProviderFromEnvRaw = process.env.PAPERCLIP_STORAGE_PROVIDER;
  const storageProviderFromEnv =
    storageProviderFromEnvRaw && STORAGE_PROVIDERS.includes(storageProviderFromEnvRaw as StorageProvider)
      ? (storageProviderFromEnvRaw as StorageProvider)
      : null;
  const storageProvider: StorageProvider = storageProviderFromEnv ?? fileStorage?.provider ?? "local_disk";
  const storageLocalDiskBaseDir = resolveHomeAwarePath(
    process.env.PAPERCLIP_STORAGE_LOCAL_DIR ?? fileStorage?.localDisk?.baseDir ?? resolveDefaultStorageDir(),
  );
  const storageS3Bucket = process.env.PAPERCLIP_STORAGE_S3_BUCKET ?? fileStorage?.s3?.bucket ?? "paperclip";
  const storageS3Region = process.env.PAPERCLIP_STORAGE_S3_REGION ?? fileStorage?.s3?.region ?? "us-east-1";
  const storageS3Endpoint = process.env.PAPERCLIP_STORAGE_S3_ENDPOINT ?? fileStorage?.s3?.endpoint ?? undefined;
  const storageS3Prefix = process.env.PAPERCLIP_STORAGE_S3_PREFIX ?? fileStorage?.s3?.prefix ?? "";
  const storageS3ForcePathStyle =
    process.env.PAPERCLIP_STORAGE_S3_FORCE_PATH_STYLE !== undefined
      ? process.env.PAPERCLIP_STORAGE_S3_FORCE_PATH_STYLE === "true"
      : (fileStorage?.s3?.forcePathStyle ?? false);

  // Deployment identity priority:
  //   1. Instance config file (written by provisioning or baked into managed image)
  //   2. Self-hosted file config (paperclip.yaml)
  //   3. Env vars (self-hosted docker-compose fallback — not used by managed containers)
  //   4. Defaults
  const instanceConfig = loadInstanceConfig();
  const hostedMode = instanceConfig.hostedMode ?? false;

  const feedbackExportBackendUrl =
    process.env.PAPERCLIP_FEEDBACK_EXPORT_BACKEND_URL?.trim() ||
    process.env.PAPERCLIP_TELEMETRY_BACKEND_URL?.trim() ||
    undefined;
  const feedbackExportBackendToken =
    process.env.PAPERCLIP_FEEDBACK_EXPORT_BACKEND_TOKEN?.trim() ||
    process.env.PAPERCLIP_TELEMETRY_BACKEND_TOKEN?.trim() ||
    undefined;

  const deploymentModeFromInstance =
    instanceConfig.deploymentMode && DEPLOYMENT_MODES.includes(instanceConfig.deploymentMode as DeploymentMode)
      ? (instanceConfig.deploymentMode as DeploymentMode)
      : null;
  const deploymentModeFromEnvRaw = process.env.PAPERCLIP_DEPLOYMENT_MODE;
  const deploymentModeFromEnv =
    deploymentModeFromEnvRaw && DEPLOYMENT_MODES.includes(deploymentModeFromEnvRaw as DeploymentMode)
      ? (deploymentModeFromEnvRaw as DeploymentMode)
      : null;
  const deploymentMode: DeploymentMode = hostedMode
    ? "hosted_proxy"
    : (deploymentModeFromInstance ?? fileConfig?.server.deploymentMode ?? deploymentModeFromEnv ?? "local_trusted");

  const deploymentExposureFromInstance =
    instanceConfig.deploymentExposure &&
    DEPLOYMENT_EXPOSURES.includes(instanceConfig.deploymentExposure as DeploymentExposure)
      ? (instanceConfig.deploymentExposure as DeploymentExposure)
      : null;
  const deploymentExposureFromEnvRaw = process.env.PAPERCLIP_DEPLOYMENT_EXPOSURE;
  const deploymentExposureFromEnv =
    deploymentExposureFromEnvRaw && DEPLOYMENT_EXPOSURES.includes(deploymentExposureFromEnvRaw as DeploymentExposure)
      ? (deploymentExposureFromEnvRaw as DeploymentExposure)
      : null;
  const deploymentExposure: DeploymentExposure =
    deploymentMode === "local_trusted"
      ? "private"
      : (deploymentExposureFromInstance ?? fileConfig?.server.exposure ?? deploymentExposureFromEnv ?? "private");
  const authBaseUrlModeFromEnvRaw = process.env.PAPERCLIP_AUTH_BASE_URL_MODE;
  const authBaseUrlModeFromEnv =
    authBaseUrlModeFromEnvRaw && AUTH_BASE_URL_MODES.includes(authBaseUrlModeFromEnvRaw as AuthBaseUrlMode)
      ? (authBaseUrlModeFromEnvRaw as AuthBaseUrlMode)
      : null;
  const publicUrlFromEnv = process.env.PAPERCLIP_PUBLIC_URL;
  const authPublicBaseUrlRaw =
    process.env.PAPERCLIP_AUTH_PUBLIC_BASE_URL ??
    process.env.BETTER_AUTH_URL ??
    process.env.BETTER_AUTH_BASE_URL ??
    publicUrlFromEnv ??
    fileConfig?.auth?.publicBaseUrl;
  const authPublicBaseUrl = authPublicBaseUrlRaw?.trim() || undefined;
  const authBaseUrlMode: AuthBaseUrlMode =
    authBaseUrlModeFromEnv ?? fileConfig?.auth?.baseUrlMode ?? (authPublicBaseUrl ? "explicit" : "auto");
  const disableSignUpFromEnv = process.env.PAPERCLIP_AUTH_DISABLE_SIGN_UP;
  const authDisableSignUp: boolean =
    disableSignUpFromEnv !== undefined ? disableSignUpFromEnv === "true" : (fileConfig?.auth?.disableSignUp ?? false);
  const allowedHostnamesFromEnvRaw = process.env.PAPERCLIP_ALLOWED_HOSTNAMES;
  const allowedHostnamesFromEnv = allowedHostnamesFromEnvRaw
    ? allowedHostnamesFromEnvRaw
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.length > 0)
    : null;
  const publicUrlHostname = authPublicBaseUrl
    ? (() => {
        try {
          return new URL(authPublicBaseUrl).hostname.trim().toLowerCase();
        } catch {
          return null;
        }
      })()
    : null;
  const allowedHostnames = Array.from(
    new Set(
      [
        ...(allowedHostnamesFromEnv ?? fileConfig?.server.allowedHostnames ?? []),
        ...(publicUrlHostname ? [publicUrlHostname] : []),
      ]
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
  const companyDeletionEnvRaw = process.env.PAPERCLIP_ENABLE_COMPANY_DELETION;
  const companyDeletionEnabled =
    companyDeletionEnvRaw !== undefined ? companyDeletionEnvRaw === "true" : deploymentMode === "local_trusted";
  const databaseBackupEnabled =
    process.env.PAPERCLIP_DB_BACKUP_ENABLED !== undefined
      ? process.env.PAPERCLIP_DB_BACKUP_ENABLED === "true"
      : (fileDatabaseBackup?.enabled ?? true);
  const databaseBackupIntervalMinutes = Math.max(
    1,
    Number(process.env.PAPERCLIP_DB_BACKUP_INTERVAL_MINUTES) || fileDatabaseBackup?.intervalMinutes || 60,
  );
  const databaseBackupRetentionDays = Math.max(
    1,
    Number(process.env.PAPERCLIP_DB_BACKUP_RETENTION_DAYS) || fileDatabaseBackup?.retentionDays || 30,
  );
  const databaseBackupDir = resolveHomeAwarePath(
    process.env.PAPERCLIP_DB_BACKUP_DIR ?? fileDatabaseBackup?.dir ?? resolveDefaultBackupDir(),
  );

  return {
    deploymentMode,
    deploymentExposure,
    host: process.env.HOST ?? fileConfig?.server.host ?? "127.0.0.1",
    port: Number(process.env.PORT) || fileConfig?.server.port || 3100,
    allowedHostnames,
    authBaseUrlMode,
    authPublicBaseUrl,
    authDisableSignUp,
    databaseMode: fileDatabaseMode,
    databaseUrl: process.env.DATABASE_URL ?? fileDbUrl,
    embeddedPostgresDataDir: resolveHomeAwarePath(
      fileConfig?.database.embeddedPostgresDataDir ?? resolveDefaultEmbeddedPostgresDir(),
    ),
    embeddedPostgresPort: fileConfig?.database.embeddedPostgresPort ?? 54329,
    databaseBackupEnabled,
    databaseBackupIntervalMinutes,
    databaseBackupRetentionDays,
    databaseBackupDir,
    serveUi:
      process.env.SERVE_UI !== undefined ? process.env.SERVE_UI === "true" : (fileConfig?.server.serveUi ?? true),
    uiDevMiddleware: process.env.PAPERCLIP_UI_DEV_MIDDLEWARE === "true",
    secretsProvider,
    secretsStrictMode,
    secretsMasterKeyFilePath: resolveHomeAwarePath(
      process.env.PAPERCLIP_SECRETS_MASTER_KEY_FILE ??
        fileSecrets?.localEncrypted.keyFilePath ??
        resolveDefaultSecretsKeyFilePath(),
    ),
    storageProvider,
    storageLocalDiskBaseDir,
    storageS3Bucket,
    storageS3Region,
    storageS3Endpoint,
    storageS3Prefix,
    storageS3ForcePathStyle,
    feedbackExportBackendUrl,
    feedbackExportBackendToken,
    heartbeatSchedulerEnabled: process.env.HEARTBEAT_SCHEDULER_ENABLED !== "false",
    heartbeatSchedulerIntervalMs: Math.max(10000, Number(process.env.HEARTBEAT_SCHEDULER_INTERVAL_MS) || 30000),
    companyDeletionEnabled,
    telemetryEnabled: fileConfig?.telemetry?.enabled ?? true,
  };
}
