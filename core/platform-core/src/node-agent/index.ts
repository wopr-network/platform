/**
 * NodeAgent — the worker process that runs on every agent droplet.
 *
 * Scorched-earth rewrite after the null-target refactor and WS-bus deletion.
 * There is NO WebSocket client. There is NO command bus. There is NO
 * in-memory state the core depends on. The agent's only transport to core
 * is:
 *
 *   1. **HTTP registration** (boot only): POST /internal/nodes/register-token
 *      or /internal/nodes/register to obtain `nodeId`, `nodeSecret`, and a
 *      `dbUrl` for the shared `wopr_agent` Postgres role.
 *
 *   2. **Postgres via `AgentWorker`**: drain `pending_operations` rows
 *      where `target IS NULL` (creation-class) or `target = <this nodeId>`
 *      (lifecycle-class). Winning agents stamp their own nodeId into the
 *      result. Per-connection `SET agent.node_id` GUC + the RLS policy
 *      enforce isolation.
 *
 * Everything else the agent used to do — heartbeat messages, health events,
 * command dispatch over WS — is either gone or will come back via the queue
 * in a follow-up commit if we find we need it.
 *
 * Hard requirement: `dbUrl` MUST be set. If it's missing, `start()` throws.
 * There is no fallback to a dead transport.
 */

import { randomUUID } from "node:crypto";
import { hostname, networkInterfaces, totalmem } from "node:os";
import { logger } from "../config/logger.js";
import type { OperationHandler } from "../queue/queue-worker.js";
import { type RunningAgentQueueWorker, startAgentQueueWorker } from "./agent-worker.js";
import { BackupManager, HotBackupScheduler } from "./backup.js";
import { DockerManager } from "./docker.js";
import { buildAgentOperationHandlers } from "./operation-handlers.js";
import { AGENT_VERSION, type NodeAgentConfig, type NodeRegistration, nodeAgentConfigSchema } from "./types.js";

export class NodeAgent {
  private readonly config: NodeAgentConfig;
  private readonly dockerManager: DockerManager;
  private readonly backupManager: BackupManager;
  private readonly hotBackupScheduler: HotBackupScheduler;

  /** Shared operation handler map — the only dispatch table on the agent. */
  private readonly operationHandlers: Map<string, OperationHandler>;

  private agentQueueWorker: RunningAgentQueueWorker | null = null;

  constructor(config: NodeAgentConfig, dockerManager?: DockerManager) {
    this.config = config;
    this.dockerManager = dockerManager ?? new DockerManager();
    this.backupManager = new BackupManager(this.dockerManager, config.backupDir, config.s3Bucket);
    this.hotBackupScheduler = new HotBackupScheduler(this.dockerManager, config.backupDir, config.s3Bucket);
    this.operationHandlers = buildAgentOperationHandlers({
      dockerManager: this.dockerManager,
      backupManager: this.backupManager,
      hotBackupScheduler: this.hotBackupScheduler,
      backupDir: config.backupDir,
      // Node id is resolved at handler invocation time because token-based
      // registration assigns it AFTER the handler map is built. Reading
      // this.config.nodeId per-call picks up the assigned value.
      getAgentNodeId: () => this.config.nodeId ?? "",
    });
  }

  /**
   * Boot the agent:
   *   1. Register with the platform HTTP API to obtain nodeId + dbUrl.
   *   2. Start the hot backup scheduler (local Docker snapshot cron).
   *   3. Start the Postgres-backed queue worker.
   *
   * Throws if registration fails to return a dbUrl. There is no WebSocket
   * fallback — the queue is the only transport.
   */
  async start(): Promise<void> {
    logger.info(`Node agent ${this.config.nodeId ?? "(unregistered)"} starting (v${AGENT_VERSION})`);

    await this.register();
    this.hotBackupScheduler.start();

    if (!this.config.dbUrl) {
      throw new Error(
        "NodeAgent: registration did not yield a dbUrl. The core must have secrets.agentDbPassword set in Vault before an agent can boot.",
      );
    }
    if (!this.config.nodeId) {
      throw new Error("NodeAgent: registration did not yield a nodeId — cannot start the queue worker");
    }

    this.agentQueueWorker = await startAgentQueueWorker({
      dbUrl: this.config.dbUrl,
      nodeId: this.config.nodeId,
      workerId: `agent-${this.config.nodeId}-${randomUUID()}`,
      handlers: this.operationHandlers,
    });
  }

  /** Gracefully shut down the agent. */
  async stop(): Promise<void> {
    this.hotBackupScheduler.stop();

    if (this.agentQueueWorker) {
      const handle = this.agentQueueWorker;
      this.agentQueueWorker = null;
      try {
        await handle.stop();
      } catch (err) {
        logger.warn("Agent queue worker stop failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info("Node agent stopped");
  }

  // ---------------------------------------------------------------------------
  // Registration (HTTP only)
  // ---------------------------------------------------------------------------

  /** Register with the platform API via HTTP POST. */
  private async register(): Promise<void> {
    // If we already have a persistent secret, use it.
    if (this.config.nodeSecret && this.config.nodeId) {
      await this.registerWithSecret();
      return;
    }
    // First-time registration with one-time token.
    if (this.config.registrationToken) {
      await this.registerWithToken();
      return;
    }
    throw new Error("No credentials available for registration");
  }

  /** Register using the persistent per-node secret (returning agent). */
  private async registerWithSecret(): Promise<void> {
    const url = `${this.config.platformUrl}/internal/nodes/register`;
    const body: NodeRegistration = {
      node_id: this.config.nodeId ?? "",
      host: getLocalIp(),
      capacity_mb: Math.round(totalmem() / 1024 / 1024),
      agent_version: AGENT_VERSION,
    };

    logger.debug(`Registering with platform: ${url}`);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.nodeSecret}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Re-registration failed (${response.status}): ${text}`);
    }

    // The returning-node endpoint may also include db_url in the response.
    // Parse it so a restarting agent picks up rotated credentials.
    try {
      const result = (await response.json()) as { db_url?: string };
      if (typeof result.db_url === "string" && result.db_url.length > 0) {
        this.config.dbUrl = result.db_url;
      }
    } catch {
      // No JSON body — that's OK for re-registration.
    }

    logger.info(`Re-registered as ${this.config.nodeId}`);
  }

  /** Register using a one-time token (first boot). */
  private async registerWithToken(): Promise<void> {
    const url = `${this.config.platformUrl}/internal/nodes/register-token`;
    const body = {
      registration_token: this.config.registrationToken,
      host: getLocalIp(),
      capacity_mb: Math.round(totalmem() / 1024 / 1024),
      agent_version: AGENT_VERSION,
    };

    logger.debug(`Registering with platform: ${url}`);

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Token registration failed (${response.status}): ${text}`);
    }

    const result = (await response.json()) as {
      node_id: string;
      node_secret: string;
      db_url?: string;
      spaces?: {
        access_key: string;
        secret_key: string;
        endpoint: string;
        bucket: string;
        region: string;
      };
    };

    const nodeId = sanitizeCredentialField(result.node_id, "node_id");
    const nodeSecret = sanitizeCredentialField(result.node_secret, "node_secret");
    const dbUrl = typeof result.db_url === "string" && result.db_url.length > 0 ? result.db_url : undefined;

    this.config.nodeId = nodeId;
    this.config.nodeSecret = nodeSecret;
    if (dbUrl) this.config.dbUrl = dbUrl;
    await this.saveCredentials(nodeId, nodeSecret, dbUrl);

    if (result.spaces) {
      await this.writeS3Config(result.spaces);
      this.config.s3Bucket = result.spaces.bucket;
    }

    logger.info(`Registered as ${nodeId}, credentials saved`);
  }

  /** Persist credentials to disk (mode 0o600). */
  private async saveCredentials(nodeId: string, nodeSecret: string, dbUrl?: string): Promise<void> {
    const { writeFile, mkdir } = await import("node:fs/promises");
    const { dirname } = await import("node:path");

    const credPath = this.config.credentialsPath ?? "/etc/wopr/credentials.json";
    await mkdir(dirname(credPath), { recursive: true });
    const payload: { nodeId: string; nodeSecret: string; dbUrl?: string } = { nodeId, nodeSecret };
    if (dbUrl) payload.dbUrl = dbUrl;
    await writeFile(credPath, JSON.stringify(payload, null, 2), { mode: 0o600 });
    logger.info(`Credentials saved to ${credPath}`);
  }

  /** Write .s3cfg for s3cmd backup operations (mode 0o600). */
  private async writeS3Config(spaces: {
    access_key: string;
    secret_key: string;
    endpoint: string;
    bucket: string;
    region: string;
  }): Promise<void> {
    const { writeFile } = await import("node:fs/promises");
    const { homedir } = await import("node:os");

    const s3cfg = `[default]
access_key = ${spaces.access_key}
secret_key = ${spaces.secret_key}
host_base = ${spaces.endpoint}
host_bucket = %(bucket)s.${spaces.endpoint}
bucket_location = ${spaces.region}
use_https = True
signature_v2 = False
`;

    const cfgPath = `${homedir()}/.s3cfg`;
    await writeFile(cfgPath, s3cfg, { mode: 0o600 });
    logger.info(`Wrote S3 config to ${cfgPath}`);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Validate a credential field received from the network. */
function sanitizeCredentialField(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid ${name} from registration response`);
  }
  return value;
}

/** Best-effort local IP for registration metadata. */
function getLocalIp(): string {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return hostname();
}

// ---------------------------------------------------------------------------
// Main entry point — runs when invoked as `node dist/node-agent/index.js`
// ---------------------------------------------------------------------------

const isMain = process.argv[1]?.endsWith("node-agent/index.js") || process.argv[1]?.endsWith("node-agent/index.ts");

if (isMain) {
  // Try to load saved credentials first (from previous token registration)
  let savedCreds: { nodeId?: string; nodeSecret?: string; dbUrl?: string } = {};
  const credPath = process.env.CREDENTIALS_PATH ?? "/etc/wopr/credentials.json";
  try {
    const { readFileSync } = await import("node:fs");
    savedCreds = JSON.parse(readFileSync(credPath, "utf-8")) as {
      nodeId?: string;
      nodeSecret?: string;
      dbUrl?: string;
    };
  } catch {
    // No saved credentials — first run via token
  }

  const config = nodeAgentConfigSchema.parse({
    platformUrl: process.env.PLATFORM_URL,
    nodeId: savedCreds.nodeId ?? process.env.NODE_ID,
    nodeSecret: savedCreds.nodeSecret ?? process.env.WOPR_NODE_SECRET ?? process.env.NODE_SECRET,
    registrationToken: process.env.REGISTRATION_TOKEN,
    heartbeatIntervalMs: process.env.HEARTBEAT_INTERVAL_MS,
    backupDir: process.env.BACKUP_DIR,
    s3Bucket: process.env.S3_BUCKET,
    credentialsPath: credPath,
    woprNodeSecret: process.env.WOPR_NODE_SECRET,
    dbUrl: savedCreds.dbUrl ?? process.env.AGENT_DB_URL,
  });

  // Build the DockerManager with the agent's local registry auth so every
  // pull (warm pool, tenant create, restore) inherits credentials without
  // the core having to flow them through every queue payload. The registry
  // creds are bootstrap config for this host's docker daemon — they're set
  // alongside docker.sock access at provision time.
  const registryUsername = process.env.REGISTRY_USERNAME;
  const registryPassword = process.env.REGISTRY_PASSWORD;
  const registryServer = process.env.REGISTRY_SERVER;
  const defaultRegistryAuth =
    registryUsername && registryPassword && registryServer
      ? { username: registryUsername, password: registryPassword, serveraddress: registryServer }
      : null;
  // Default docker network so spawned tenant containers can reach (and be
  // reached by) the rest of the core stack via the host overlay. Same role
  // as registry auth — per-host bootstrap config, not application secret.
  const defaultNetwork = process.env.DOCKER_NETWORK ?? null;
  const dockerManager = new DockerManager(undefined, { defaultRegistryAuth, defaultNetwork });

  const agent = new NodeAgent(config, dockerManager);

  const shutdown = async () => {
    logger.info("Shutting down...");
    await agent.stop();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  agent.start().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    logger.error("Failed to start node agent", { error: message, stack });
    process.exit(1);
  });
}
