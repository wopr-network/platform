import { randomUUID } from "node:crypto";
import { hostname, networkInterfaces, totalmem } from "node:os";
import { WebSocket } from "ws";
import { logger } from "../config/logger.js";
import type { OperationHandler } from "../queue/queue-worker.js";
import { type RunningAgentQueueWorker, startAgentQueueWorker } from "./agent-worker.js";
import { BackupManager, HotBackupScheduler } from "./backup.js";
import { DockerManager } from "./docker.js";
import { HealthMonitor } from "./health.js";
import { collectHeartbeat } from "./heartbeat.js";
import { buildAgentOperationHandlers } from "./operation-handlers.js";
import {
  AGENT_VERSION,
  ALLOWED_COMMANDS,
  type Command,
  type CommandResult,
  type CommandType,
  commandSchema,
  type HealthEvent,
  type NodeAgentConfig,
  type NodeRegistration,
  nodeAgentConfigSchema,
} from "./types.js";

/** Maximum WebSocket reconnect delay (30 seconds) */
const MAX_RECONNECT_DELAY_MS = 30_000;

/** Initial reconnect delay (1 second) */
const INITIAL_RECONNECT_DELAY_MS = 1_000;

/**
 * The node agent: a lightweight daemon that runs on every worker node.
 *
 * - Registers with platform API on boot
 * - Maintains WebSocket connection for heartbeat + commands
 * - Monitors container health via Docker events
 * - Executes commands from the platform (start, stop, export, etc.)
 */
export class NodeAgent {
  private readonly config: NodeAgentConfig;
  private readonly dockerManager: DockerManager;
  private readonly backupManager: BackupManager;
  private readonly hotBackupScheduler: HotBackupScheduler;
  private readonly healthMonitor: HealthMonitor;

  /**
   * Single source of truth for operation dispatch. Used by both the legacy
   * WebSocket bus (`handleMessage` → `dispatch`) and the DB-as-channel queue
   * worker. Constructed once at boot from `buildAgentOperationHandlers`.
   */
  private readonly operationHandlers: Map<string, OperationHandler>;

  private ws: WebSocket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
  private stopped = false;

  /**
   * The DB-as-channel queue worker, when configured. Null until `start()`
   * has finished registration AND `config.dbUrl` was supplied. Stopped on
   * `stop()`.
   */
  private agentQueueWorker: RunningAgentQueueWorker | null = null;

  constructor(config: NodeAgentConfig, dockerManager?: DockerManager) {
    this.config = config;
    this.dockerManager = dockerManager ?? new DockerManager();
    this.backupManager = new BackupManager(this.dockerManager, config.backupDir, config.s3Bucket);
    this.hotBackupScheduler = new HotBackupScheduler(this.dockerManager, config.backupDir, config.s3Bucket);
    this.healthMonitor = new HealthMonitor(this.dockerManager, config.nodeId ?? "unknown", (event) =>
      this.sendHealthEvent(event),
    );
    this.operationHandlers = buildAgentOperationHandlers({
      dockerManager: this.dockerManager,
      backupManager: this.backupManager,
      hotBackupScheduler: this.hotBackupScheduler,
      backupDir: config.backupDir,
    });
  }

  /** Boot the agent: register, connect WebSocket, start monitoring. */
  async start(): Promise<void> {
    this.stopped = false;
    logger.info(`Node agent ${this.config.nodeId ?? "(unregistered)"} starting (v${AGENT_VERSION})`);

    await this.register();
    this.connect();
    await this.healthMonitor.start();
    this.hotBackupScheduler.start();

    // DB-as-channel queue worker — only when explicitly opted in via dbUrl.
    // Until Phase 2.3c mints per-node credentials at registration time, this
    // is gated on a single shared connection string in the agent's config.
    // Both transports (WS bus + queue worker) coexist; nothing in core
    // enqueues to agents yet, so the worker is dormant in production.
    if (this.config.dbUrl && this.config.nodeId) {
      try {
        this.agentQueueWorker = await startAgentQueueWorker({
          dbUrl: this.config.dbUrl,
          nodeId: this.config.nodeId,
          workerId: `agent-${this.config.nodeId}-${randomUUID()}`,
          handlers: this.operationHandlers,
        });
      } catch (err) {
        logger.warn("Agent queue worker failed to start (WS bus continues)", {
          nodeId: this.config.nodeId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  /** Gracefully shut down the agent. */
  stop(): void {
    this.stopped = true;
    this.healthMonitor.stop();
    this.hotBackupScheduler.stop();

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    // Stop the queue worker if it was started. Fire-and-forget — stop() is
    // synchronous to keep the API stable for existing callers.
    if (this.agentQueueWorker) {
      const handle = this.agentQueueWorker;
      this.agentQueueWorker = null;
      void handle.stop().catch((err) => {
        logger.warn("Agent queue worker stop failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    logger.info("Node agent stopped");
  }

  /** Register with the platform API via HTTP POST. */
  private async register(): Promise<void> {
    // If we already have a persistent secret, use it
    if (this.config.nodeSecret && this.config.nodeId) {
      await this.registerWithSecret();
      return;
    }

    // First-time registration with one-time token
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
      throw new Error(`Registration failed (${response.status}): ${text}`);
    }

    logger.info("Registered with platform");
  }

  /** Register using a one-time token (first-time setup). */
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

    this.config.nodeId = nodeId;
    this.config.nodeSecret = nodeSecret;
    await this.saveCredentials(nodeId, nodeSecret);

    if (result.spaces) {
      await this.writeS3Config(result.spaces);
      this.config.s3Bucket = result.spaces.bucket;
    }

    logger.info(`Registered as ${result.node_id}, credentials saved`);
  }

  /** Persist credentials to disk (mode 0o600). */
  private async saveCredentials(nodeId: string, nodeSecret: string): Promise<void> {
    const { writeFile, mkdir } = await import("node:fs/promises");
    const { dirname } = await import("node:path");

    const credPath = this.config.credentialsPath ?? "/etc/wopr/credentials.json";
    await mkdir(dirname(credPath), { recursive: true });
    await writeFile(credPath, JSON.stringify({ nodeId, nodeSecret }, null, 2), { mode: 0o600 });
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
`;
    const cfgPath = `${homedir()}/.s3cfg`;
    await writeFile(cfgPath, s3cfg, { mode: 0o600 });
    logger.info(`s3cmd config written to ${cfgPath} (bucket: ${spaces.bucket}, region: ${spaces.region})`);
  }

  /** Establish WebSocket connection with auto-reconnect. */
  private connect(): void {
    if (this.stopped) return;

    const wsUrl = `${this.config.platformUrl.replace(/^http/, "ws")}/internal/nodes/${this.config.nodeId ?? ""}/ws`;

    logger.info(`Connecting WebSocket: ${wsUrl}`);
    this.ws = new WebSocket(wsUrl, {
      headers: {
        Authorization: `Bearer ${this.config.nodeSecret}`,
      },
    });

    this.ws.on("open", () => {
      logger.info("WebSocket connected");
      this.reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
      this.startHeartbeat();
    });

    this.ws.on("message", (data: Buffer) => {
      this.handleMessage(data);
    });

    this.ws.on("close", () => {
      logger.warn("WebSocket closed");
      this.stopHeartbeat();
      this.scheduleReconnect();
    });

    this.ws.on("error", (err: Error) => {
      logger.error("WebSocket error", { err: err.message });
    });
  }

  /** Schedule a reconnection with exponential backoff. */
  private scheduleReconnect(): void {
    if (this.stopped) return;

    logger.info(`Reconnecting in ${this.reconnectDelay}ms`);
    setTimeout(() => this.connect(), this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
  }

  /** Start sending heartbeat at configured interval. */
  private startHeartbeat(): void {
    this.stopHeartbeat();

    const sendHeartbeat = async () => {
      try {
        const heartbeat = await collectHeartbeat(this.config.nodeId ?? "unknown", this.dockerManager);
        this.send(heartbeat);
      } catch (err) {
        logger.error("Failed to send heartbeat", { err });
      }
    };

    // Send first heartbeat immediately
    sendHeartbeat();
    this.heartbeatTimer = setInterval(sendHeartbeat, this.config.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /** Handle an inbound WebSocket message (command from platform). */
  private handleMessage(data: Buffer): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data.toString());
    } catch {
      logger.warn("Received non-JSON WebSocket message");
      return;
    }

    const result = commandSchema.safeParse(parsed);
    if (!result.success) {
      logger.warn("Received invalid command", { errors: result.error.issues });
      // If there's an id field, send back an error result
      const raw = parsed as Record<string, unknown>;
      if (typeof raw.id === "string") {
        this.send({
          id: raw.id,
          type: "command_result",
          command: raw.type ?? "unknown",
          success: false,
          error: `Invalid command: ${result.error.issues.map((i) => i.message).join(", ")}`,
        });
      }
      return;
    }

    this.executeCommand(result.data);
  }

  /** Dispatch and execute a validated command. */
  private async executeCommand(command: Command): Promise<void> {
    // Double-check command is in allowlist (Zod already validates, but belt-and-suspenders)
    if (!(ALLOWED_COMMANDS as readonly string[]).includes(command.type)) {
      this.sendResult(command.id, command.type, false, undefined, `Unknown command: ${command.type}`);
      return;
    }

    logger.info(`Executing command: ${command.type}`, { commandId: command.id });

    try {
      const data = await this.dispatch(command);
      this.sendResult(command.id, command.type, true, data);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Command ${command.type} failed`, { commandId: command.id, err: message });
      this.sendResult(command.id, command.type, false, undefined, message);
    }
  }

  /**
   * Route a command to the appropriate handler. Looks up the handler in the
   * shared `operationHandlers` map (built once in the constructor by
   * `buildAgentOperationHandlers`). The same map is also used by the DB-as-
   * channel queue worker, so the WS path and the queue path can never
   * dispatch differently for the same command type.
   */
  private async dispatch(command: Command): Promise<unknown> {
    const handler = this.operationHandlers.get(command.type);
    if (handler === undefined) {
      throw new Error(`Unhandled command: ${command.type}`);
    }
    return await handler(command.payload);
  }

  /** Send a command result back over WebSocket. */
  private sendResult(id: string, command: CommandType, success: boolean, data?: unknown, error?: string): void {
    const result: CommandResult = { id, type: "command_result", command, success };
    if (data !== undefined) result.data = data;
    if (error) result.error = error;
    this.send(result);
  }

  /** Send a health event over WebSocket. */
  private sendHealthEvent(event: HealthEvent): void {
    this.send(event);
  }

  /** Send JSON payload over WebSocket. */
  private send(payload: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }
}

/** Validate a credential field received from the network. */
function sanitizeCredentialField(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid ${name}: expected non-empty string`);
  }
  if (value.includes("..") || value.includes("/") || value.includes("\\") || value.includes("\0")) {
    throw new Error(`Invalid ${name}: contains forbidden characters`);
  }
  if (value.length > 1024) {
    throw new Error(`Invalid ${name}: exceeds maximum length`);
  }
  return value;
}

/** Get the first non-loopback IPv4 address. */
function getLocalIp(): string {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    const addrs = nets[name];
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === "IPv4" && !addr.internal) {
        return addr.address;
      }
    }
  }
  return hostname();
}

// ---------------------------------------------------------------------------
// CLI entrypoint — only runs when executed directly
// ---------------------------------------------------------------------------

const isMain = process.argv[1]?.endsWith("node-agent/index.js") || process.argv[1]?.endsWith("node-agent/index.ts");

if (isMain) {
  // Try to load saved credentials first (from previous token registration)
  let savedCreds: { nodeId?: string; nodeSecret?: string } = {};
  const credPath = process.env.CREDENTIALS_PATH ?? "/etc/wopr/credentials.json";
  try {
    const { readFileSync } = await import("node:fs");
    savedCreds = JSON.parse(readFileSync(credPath, "utf-8")) as { nodeId?: string; nodeSecret?: string };
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
  });

  const agent = new NodeAgent(config);

  const shutdown = () => {
    logger.info("Shutting down...");
    agent.stop();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  agent.start().catch((err) => {
    logger.error("Failed to start node agent", { err });
    process.exit(1);
  });
}
