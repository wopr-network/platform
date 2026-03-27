import { PassThrough } from "node:stream";
import type Docker from "dockerode";
import { logger } from "../config/logger.js";
import type { BotMetricsTracker } from "../gateway/bot-metrics-tracker.js";
import type { ProxyManagerInterface } from "../proxy/types.js";
import type { IBotInstanceRepository } from "./bot-instance-repository.js";
import type { BotEventType, FleetEventEmitter } from "./fleet-event-emitter.js";
import type { BotProfile, BotStatus, ContainerStats } from "./types.js";

/**
 * Instance — a runtime handle to a container.
 *
 * FleetManager is the factory: pull image, create container, return Instance.
 * Instance owns its lifecycle: start, stop, remove, setupBilling, setupProxy.
 *
 * Ephemeral instances (e.g., holyshippers) skip billing and proxy setup.
 * They bill per-token at the gateway layer, not per-instance.
 */

export interface InstanceDeps {
  docker: Docker;
  profile: BotProfile;
  containerId: string;
  containerName: string;
  url: string;
  /** Optional — non-ephemeral instances use these for billing/proxy/events */
  instanceRepo?: IBotInstanceRepository;
  proxyManager?: ProxyManagerInterface;
  eventEmitter?: FleetEventEmitter;
  botMetricsTracker?: BotMetricsTracker;
}

export class Instance {
  readonly id: string;
  readonly containerId: string;
  readonly containerName: string;
  readonly url: string;
  readonly profile: BotProfile;

  private readonly docker: Docker;
  private readonly instanceRepo: IBotInstanceRepository | undefined;
  private readonly proxyManager: ProxyManagerInterface | undefined;
  private readonly eventEmitter: FleetEventEmitter | undefined;
  private readonly botMetricsTracker: BotMetricsTracker | undefined;

  /** Simple per-instance mutex to serialize start/stop/restart/remove. */
  private lockPromise = Promise.resolve();

  constructor(deps: InstanceDeps) {
    this.id = deps.profile.id;
    this.containerId = deps.containerId;
    this.containerName = deps.containerName;
    this.url = deps.url;
    this.profile = deps.profile;
    this.docker = deps.docker;
    this.instanceRepo = deps.instanceRepo;
    this.proxyManager = deps.proxyManager;
    this.eventEmitter = deps.eventEmitter;
    this.botMetricsTracker = deps.botMetricsTracker;
  }

  /** Serialize to a plain object safe for JSON.stringify / tRPC responses. */
  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      containerId: this.containerId,
      containerName: this.containerName,
      url: this.url,
      name: this.profile.name,
      image: this.profile.image,
      tenantId: this.profile.tenantId,
      env: this.profile.env,
      restartPolicy: this.profile.restartPolicy,
      nodeId: this.profile.nodeId,
    };
  }

  /**
   * Remote instances have containerId like "remote:node-3".
   * Local Docker operations are not supported — callers (e.g. wopr-platform)
   * handle remote delegation at a higher level via NodeCommandBus.
   */
  private get isRemote(): boolean {
    return this.containerId.startsWith("remote:");
  }

  private assertLocal(operation: string): void {
    if (this.isRemote) {
      throw new Error(`${operation} is not supported on remote instances — use node agent`);
    }
  }

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this.lockPromise;
    let resolve!: () => void;
    this.lockPromise = new Promise<void>((r) => {
      resolve = r;
    });
    try {
      await prev;
      return await fn();
    } finally {
      resolve();
    }
  }

  /** Emit bot.created — call only from FleetManager.create(), not getInstance() */
  emitCreated(): void {
    this.emit("bot.created");
  }

  async start(): Promise<void> {
    this.assertLocal("start()");
    return this.withLock(async () => {
      const container = this.docker.getContainer(this.containerId);
      await container.start();
      logger.info(`Instance started`, { id: this.id, containerName: this.containerName, url: this.url });
      this.emit("bot.started");
    });
  }

  async stop(): Promise<void> {
    this.assertLocal("stop()");
    return this.withLock(async () => {
      const container = this.docker.getContainer(this.containerId);
      try {
        await container.stop({ t: 10 });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes("not running") && !msg.includes("already stopped")) {
          throw err;
        }
      }
      logger.info(`Instance stopped`, { id: this.id, containerName: this.containerName });
      this.emit("bot.stopped");
    });
  }

  /**
   * Restart the container.
   * Callers that need an image update should call pullImage() first.
   */
  async restart(): Promise<void> {
    this.assertLocal("restart()");
    return this.withLock(async () => {
      this.botMetricsTracker?.reset(this.id);
      const container = this.docker.getContainer(this.containerId);
      const info = await container.inspect();
      const validStates = new Set(["running", "stopped", "exited", "dead"]);
      const currentState = typeof info.State.Status === "string" && info.State.Status ? info.State.Status : "unknown";
      if (!validStates.has(currentState)) {
        throw new Error(
          `Cannot restart instance ${this.id}: container is in state "${currentState}". ` +
            `Valid states: ${[...validStates].join(", ")}.`,
        );
      }
      await container.restart();
      logger.info(`Instance restarted`, { id: this.id, containerName: this.containerName });
      this.emit("bot.restarted");
    });
  }

  /**
   * Pull the latest version of this instance's image.
   * Call before restart() to update the image before restarting.
   */
  async pullImage(): Promise<void> {
    this.assertLocal("pullImage()");
    logger.info(`Pulling image ${this.profile.image}`, { id: this.id });
    const username = process.env.REGISTRY_USERNAME;
    const password = process.env.REGISTRY_PASSWORD;
    const server = process.env.REGISTRY_SERVER;
    const authconfig = username && password ? { username, password, serveraddress: server ?? "ghcr.io" } : undefined;
    const stream = await this.docker.pull(this.profile.image, authconfig ? { authconfig } : {});
    await new Promise<void>((resolve, reject) => {
      this.docker.modem.followProgress(stream, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
    logger.info(`Image pulled`, { id: this.id, image: this.profile.image });
  }

  async remove(removeVolumes = false): Promise<void> {
    this.assertLocal("remove()");
    return this.withLock(async () => {
      const container = this.docker.getContainer(this.containerId);
      try {
        await container.stop({ t: 5 }).catch(() => {});
        await container.remove({ force: true, v: removeVolumes });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes("No such container")) {
          throw err;
        }
      }

      if (this.proxyManager) {
        try {
          await this.proxyManager.removeRoute(this.id);
        } catch (err) {
          logger.warn("Proxy route cleanup failed (non-fatal)", { id: this.id, err });
        }
      }

      logger.info(`Instance removed`, { id: this.id, containerName: this.containerName });
      this.emit("bot.removed");
    });
  }

  /**
   * Simple container state check (running / stopped / gone).
   */
  async containerState(): Promise<"running" | "stopped" | "gone"> {
    this.assertLocal("containerState()");
    try {
      const container = this.docker.getContainer(this.containerId);
      const info = await container.inspect();
      return info.State.Running ? "running" : "stopped";
    } catch {
      return "gone";
    }
  }

  /**
   * Full status including profile data, container state, resource stats,
   * and application metrics. Returns BotStatus.
   */
  async status(): Promise<BotStatus> {
    this.assertLocal("status()");
    try {
      const container = this.docker.getContainer(this.containerId);
      const info = await container.inspect();

      let stats: ContainerStats | null = null;
      if (info.State.Running) {
        try {
          stats = await this.getStats(container);
        } catch {
          // stats not available
        }
      }

      const now = new Date().toISOString();
      return {
        id: this.profile.id,
        name: this.profile.name,
        description: this.profile.description,
        image: this.profile.image,
        containerId: info.Id,
        state: info.State.Status as BotStatus["state"],
        health: info.State.Health?.Status ?? null,
        uptime: info.State.Running && info.State.StartedAt ? info.State.StartedAt : null,
        startedAt: info.State.StartedAt || null,
        createdAt: info.Created || now,
        updatedAt: now,
        stats,
        applicationMetrics: this.botMetricsTracker?.getMetrics(this.profile.id) ?? null,
      };
    } catch {
      return this.offlineStatus();
    }
  }

  /**
   * Get container logs (demultiplexed to plain text).
   */
  async logs(tail = 100): Promise<string> {
    this.assertLocal("logs()");
    const container = this.docker.getContainer(this.containerId);
    const logBuffer = await container.logs({
      stdout: true,
      stderr: true,
      tail,
      timestamps: true,
    });

    // Docker returns multiplexed binary frames when Tty is false (the default).
    // Demultiplex by stripping the 8-byte header from each frame so callers
    // receive plain text instead of binary garbage interleaved with log lines.
    const buf = Buffer.isBuffer(logBuffer) ? logBuffer : Buffer.from(logBuffer as unknown as string, "binary");
    const chunks: Buffer[] = [];
    let offset = 0;
    while (offset + 8 <= buf.length) {
      const frameSize = buf.readUInt32BE(offset + 4);
      const end = offset + 8 + frameSize;
      if (end > buf.length) break;
      chunks.push(buf.subarray(offset + 8, end));
      offset = end;
    }
    // If demux produced nothing (e.g. TTY container), fall back to raw string
    return chunks.length > 0 ? Buffer.concat(chunks).toString("utf-8") : buf.toString("utf-8");
  }

  /**
   * Stream container logs in real-time (follow mode).
   * Returns a Node.js ReadableStream that emits plain-text log chunks (already demultiplexed).
   * Caller is responsible for destroying the stream when done.
   */
  async logStream(opts: { since?: string; tail?: number }): Promise<NodeJS.ReadableStream> {
    this.assertLocal("logStream()");
    const container = this.docker.getContainer(this.containerId);
    const logOpts: Record<string, unknown> = {
      stdout: true,
      stderr: true,
      follow: true,
      tail: opts.tail ?? 100,
      timestamps: true,
    };
    if (opts.since) {
      logOpts.since = opts.since;
    }

    // Docker returns a multiplexed binary stream when Tty is false (the default for
    // containers created by createContainer without Tty:true). Demultiplex it so
    // callers receive plain text without 8-byte binary frame headers.
    const multiplexed = (await container.logs(logOpts)) as unknown as NodeJS.ReadableStream;
    const pt = new PassThrough();
    (
      this.docker.modem as unknown as {
        demuxStream(stream: NodeJS.ReadableStream, stdout: PassThrough, stderr: PassThrough): void;
      }
    ).demuxStream(multiplexed, pt, pt);
    return pt;
  }

  /**
   * Get disk usage for this instance's /data volume.
   * Returns null if the container is not running or exec fails.
   */
  async getVolumeUsage(): Promise<{ usedBytes: number; totalBytes: number; availableBytes: number } | null> {
    this.assertLocal("getVolumeUsage()");
    try {
      const container = this.docker.getContainer(this.containerId);
      const info = await container.inspect();
      if (!info.State.Running) return null;

      const exec = await container.exec({
        Cmd: ["df", "-B1", "/data"],
        AttachStdout: true,
        AttachStderr: false,
      });

      const output = await new Promise<string>((resolve, reject) => {
        exec.start({}, (err: Error | null, stream: import("node:stream").Duplex | undefined) => {
          if (err) return reject(err);
          if (!stream) return reject(new Error("No stream from exec"));
          let data = "";
          stream.on("data", (chunk: Buffer) => {
            data += chunk.toString();
          });
          stream.on("end", () => resolve(data));
          stream.on("error", reject);
        });
      });

      // Parse df output — second line has the numbers
      const lines = output.trim().split("\n");
      if (lines.length < 2) return null;

      const parts = lines[lines.length - 1].split(/\s+/);
      if (parts.length < 4) return null;

      const totalBytes = parseInt(parts[1], 10);
      const usedBytes = parseInt(parts[2], 10);
      const availableBytes = parseInt(parts[3], 10);

      if (Number.isNaN(totalBytes) || Number.isNaN(usedBytes) || Number.isNaN(availableBytes)) return null;

      return { usedBytes, totalBytes, availableBytes };
    } catch {
      logger.warn(`Failed to get volume usage for instance ${this.id}`);
      return null;
    }
  }

  /**
   * Register this instance in the billing system.
   * Skip for ephemeral instances — they bill per-token, not per-instance.
   */
  async setupBilling(): Promise<void> {
    if (this.profile.ephemeral) {
      logger.info("Skipping billing setup (ephemeral)", { id: this.id });
      return;
    }
    if (!this.instanceRepo) {
      logger.warn("No instance repo — billing setup skipped", { id: this.id });
      return;
    }
    await this.instanceRepo.register(this.id, this.profile.tenantId, this.profile.name);
    logger.info("Billing registered", { id: this.id, tenantId: this.profile.tenantId });
  }

  /**
   * Register a proxy route for tenant subdomain routing.
   * Skip for ephemeral instances — they're accessed directly via Docker DNS.
   */
  async setupProxy(): Promise<void> {
    if (this.profile.ephemeral) {
      logger.info("Skipping proxy setup (ephemeral)", { id: this.id });
      return;
    }
    if (!this.proxyManager) {
      logger.warn("No proxy manager — proxy setup skipped", { id: this.id });
      return;
    }
    try {
      const subdomain = this.profile.name.toLowerCase().replace(/_/g, "-");
      const envPort = this.profile.env?.PORT;
      const upstreamPort = envPort ? Number.parseInt(envPort, 10) || 7437 : 7437;
      await this.proxyManager.addRoute({
        instanceId: this.id,
        subdomain,
        upstreamHost: this.containerName,
        upstreamPort,
        healthy: true,
      });
      logger.info("Proxy route registered", { id: this.id, subdomain });
    } catch (err) {
      logger.warn("Proxy route registration failed (non-fatal)", { id: this.id, err });
    }
  }

  private offlineStatus(): BotStatus {
    const now = new Date().toISOString();
    return {
      id: this.profile.id,
      name: this.profile.name,
      description: this.profile.description,
      image: this.profile.image,
      containerId: null,
      state: "stopped",
      health: null,
      uptime: null,
      startedAt: null,
      createdAt: now,
      updatedAt: now,
      stats: null,
      applicationMetrics: null,
    };
  }

  private async getStats(container: Docker.Container): Promise<ContainerStats> {
    const raw = await container.stats({ stream: false });

    const cpuDelta = raw.cpu_stats.cpu_usage.total_usage - raw.precpu_stats.cpu_usage.total_usage;
    const systemDelta = raw.cpu_stats.system_cpu_usage - raw.precpu_stats.system_cpu_usage;
    const numCpus = raw.cpu_stats.online_cpus || 1;
    const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * numCpus * 100 : 0;

    const memUsage = raw.memory_stats.usage || 0;
    const memLimit = raw.memory_stats.limit || 1;

    return {
      cpuPercent: Math.round(cpuPercent * 100) / 100,
      memoryUsageMb: Math.round(memUsage / 1024 / 1024),
      memoryLimitMb: Math.round(memLimit / 1024 / 1024),
      memoryPercent: Math.round((memUsage / memLimit) * 100 * 100) / 100,
    };
  }

  private emit(type: BotEventType): void {
    if (this.eventEmitter) {
      this.eventEmitter.emit({
        type,
        botId: this.id,
        tenantId: this.profile.tenantId,
        timestamp: new Date().toISOString(),
      });
    }
  }
}
