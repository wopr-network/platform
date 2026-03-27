import { randomUUID } from "node:crypto";
import { PassThrough } from "node:stream";
import type Docker from "dockerode";
import { logger } from "../config/logger.js";
import { buildDiscoveryEnv } from "../discovery/discovery-config.js";
import type { PlatformDiscoveryConfig } from "../discovery/types.js";
import type { BotMetricsTracker } from "../gateway/bot-metrics-tracker.js";
import type { ContainerResourceLimits } from "../monetization/quotas/resource-limits.js";
import type { NetworkPolicy } from "../network/network-policy.js";
import type { ProxyManagerInterface } from "../proxy/types.js";
import type { IBotInstanceRepository } from "./bot-instance-repository.js";
import type { BotEventType, FleetEventEmitter } from "./fleet-event-emitter.js";
import { Instance } from "./instance.js";
import type { INodeCommandBus } from "./node-command-bus.js";
import type { IProfileStore } from "./profile-store.js";
import { getSharedVolumeConfig } from "./shared-volume-config.js";
import type { BotProfile, BotStatus } from "./types.js";

const CONTAINER_LABEL = "wopr.managed";
const CONTAINER_ID_LABEL = "wopr.bot-id";

export class FleetManager {
  private readonly docker: Docker;
  private readonly store: IProfileStore;
  private readonly platformDiscovery: PlatformDiscoveryConfig | undefined;
  private readonly networkPolicy: NetworkPolicy | undefined;
  private readonly proxyManager: ProxyManagerInterface | undefined;
  private readonly commandBus: INodeCommandBus | undefined;
  private readonly instanceRepo: IBotInstanceRepository | undefined;
  private readonly botMetricsTracker: BotMetricsTracker | undefined;
  private readonly eventEmitter: FleetEventEmitter | undefined;
  private locks = new Map<string, Promise<void>>();

  private async withLock<T>(botId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(botId) ?? Promise.resolve();
    let resolve!: () => void;
    const next = new Promise<void>((r) => {
      resolve = r;
    });
    this.locks.set(botId, next);
    try {
      await prev;
      return await fn();
    } finally {
      resolve();
      if (this.locks.get(botId) === next) this.locks.delete(botId);
    }
  }

  constructor(
    docker: Docker,
    store: IProfileStore,
    platformDiscovery?: PlatformDiscoveryConfig,
    networkPolicy?: NetworkPolicy,
    proxyManager?: ProxyManagerInterface,
    commandBus?: INodeCommandBus,
    instanceRepo?: IBotInstanceRepository,
    botMetricsTracker?: BotMetricsTracker,
    eventEmitter?: FleetEventEmitter,
  ) {
    this.docker = docker;
    this.store = store;
    this.platformDiscovery = platformDiscovery;
    this.networkPolicy = networkPolicy;
    this.proxyManager = proxyManager;
    this.commandBus = commandBus;
    this.instanceRepo = instanceRepo;
    this.botMetricsTracker = botMetricsTracker;
    this.eventEmitter = eventEmitter;
  }

  private emitEvent(type: BotEventType, botId: string, tenantId?: string): void {
    if (!this.eventEmitter) return;
    if (!tenantId) return; // skip — event with no tenant would be invisible to all subscribers
    this.eventEmitter.emit({ type, botId, tenantId, timestamp: new Date().toISOString() });
  }

  /**
   * Look up which node a bot is assigned to.
   * Returns { nodeId, commandBus } when the bot has a remote assignment,
   * or null when it should be handled locally.
   * Callers use the returned commandBus reference directly, avoiding the need
   * to re-check this.commandBus after the call.
   */
  private async resolveNodeId(botId: string): Promise<{ nodeId: string; commandBus: INodeCommandBus } | null> {
    if (!this.commandBus || !this.instanceRepo) return null;
    const instance = await this.instanceRepo.getById(botId);
    if (!instance?.nodeId) return null;
    return { nodeId: instance.nodeId, commandBus: this.commandBus };
  }

  /**
   * Create a new bot: persist profile, pull image, create container.
   * Rolls back profile on container creation failure.
   *
   * @param params - Bot profile fields (without id)
   * @param resourceLimits - Optional Docker resource constraints (from tier)
   */
  async create(
    params: Omit<BotProfile, "id"> & { id?: string },
    resourceLimits?: ContainerResourceLimits,
  ): Promise<Instance> {
    const id = params.id ?? randomUUID();
    const hasExplicitId = "id" in params && params.id !== undefined;
    const doCreate = async (): Promise<Instance> => {
      const profile: BotProfile = { ...params, id };

      if (hasExplicitId && (await this.store.get(id))) {
        throw new Error(`Bot with id ${id} already exists`);
      }

      await this.store.save(profile);

      try {
        const remote = await this.resolveNodeId(id);
        if (remote) {
          await remote.commandBus.send(remote.nodeId, {
            type: "bot.start",
            payload: {
              name: profile.name,
              image: profile.image,
              env: profile.env,
              restart: profile.restartPolicy,
            },
          });
          // Remote bots have no local container — return a remote Instance
          const containerName = `wopr-${profile.name.replace(/_/g, "-")}`;
          const remoteInstance = new Instance({
            docker: this.docker,
            profile,
            containerId: `remote:${remote.nodeId}`,
            containerName,
            url: `remote://${remote.nodeId}/${containerName}`,
            instanceRepo: this.instanceRepo,
            proxyManager: this.proxyManager,
            eventEmitter: this.eventEmitter,
            botMetricsTracker: this.botMetricsTracker,
          });
          remoteInstance.emitCreated();
          return remoteInstance;
        } else {
          await this.pullImage(profile.image);
          await this.createContainer(profile, resourceLimits);
        }
      } catch (err) {
        logger.error(`Failed to create container for bot ${profile.id}, rolling back profile`, {
          err,
        });
        await this.store.delete(profile.id);
        throw err;
      }

      const instance = await this.buildInstance(profile);
      instance.emitCreated();
      return instance;
    };

    return hasExplicitId ? this.withLock(id, doCreate) : doCreate();
  }

  /**
   * Build an Instance from a profile after container creation.
   * Inspects the Docker container to resolve container name and URL.
   */
  private resolvePort(profile: BotProfile): number {
    const envPort = profile.env?.PORT;
    return envPort ? Number.parseInt(envPort, 10) || 7437 : 7437;
  }

  /**
   * Get an Instance handle for an existing bot by ID.
   * Looks up the profile and inspects the Docker container.
   */
  async getInstance(id: string): Promise<Instance> {
    const profile = await this.store.get(id);
    if (!profile) throw new BotNotFoundError(id);
    return this.buildInstance(profile);
  }

  private async buildInstance(profile: BotProfile): Promise<Instance> {
    const dockerContainer = await this.findContainer(profile.id);
    if (!dockerContainer) throw new Error(`Container for ${profile.id} not found after creation`);
    const info = await dockerContainer.inspect();
    const containerName = info.Name.replace(/^\//, "");
    const containerId = info.Id;

    // Resolve URL from network DNS or host port mapping
    let url: string;
    const port = this.resolvePort(profile);
    if (profile.network) {
      url = `http://${containerName}:${port}`;
    } else {
      const portBindings = info.NetworkSettings?.Ports?.[`${port}/tcp`];
      const hostPort = portBindings?.[0]?.HostPort ?? String(port);
      url = `http://localhost:${hostPort}`;
    }

    return new Instance({
      docker: this.docker,
      profile,
      containerId,
      containerName,
      url,
      instanceRepo: this.instanceRepo,
      proxyManager: this.proxyManager,
      eventEmitter: this.eventEmitter,
      botMetricsTracker: this.botMetricsTracker,
    });
  }

  /**
   * Remove a bot: stop container, remove it, optionally remove volumes, delete profile.
   * For remote bots, delegates stop+remove to the node agent via NodeCommandBus.
   * Container removal is delegated to Instance.remove(); fleet-level cleanup
   * (profile store, network policy) stays here.
   */
  async remove(id: string, removeVolumes = false): Promise<void> {
    return this.withLock(id, async () => {
      const profile = await this.store.get(id);
      if (!profile) throw new BotNotFoundError(id);

      const remote = await this.resolveNodeId(id);
      if (remote) {
        await remote.commandBus.send(remote.nodeId, {
          type: "bot.remove",
          payload: { name: profile.name, removeVolumes },
        });
      } else {
        try {
          const instance = await this.buildInstance(profile);
          await instance.remove(removeVolumes);
        } catch {
          // Container may already be gone — not fatal for fleet-level cleanup
        }
      }

      // Clean up tenant network if no more containers remain
      if (this.networkPolicy) {
        await this.networkPolicy.cleanupAfterRemoval(profile.tenantId);
      }

      await this.store.delete(id);
      logger.info(`Removed bot ${id}`);
      this.emitEvent("bot.removed", id, profile.tenantId);
    });
  }

  /**
   * Get live status of a single bot.
   * Delegates to Instance.status() which returns a full BotStatus.
   * Falls back to offline status when no container exists.
   */
  async status(id: string): Promise<BotStatus> {
    const profile = await this.store.get(id);
    if (!profile) throw new BotNotFoundError(id);
    return this.statusForProfile(profile);
  }

  /**
   * List all bots with live status.
   */
  async listAll(): Promise<BotStatus[]> {
    const profiles = await this.store.list();
    return Promise.all(profiles.map((p) => this.statusForProfile(p)));
  }

  /**
   * List bots belonging to a specific tenant with live status.
   */
  async listByTenant(tenantId: string): Promise<BotStatus[]> {
    const profiles = await this.store.list();
    const tenantProfiles = profiles.filter((p) => p.tenantId === tenantId);
    return Promise.all(tenantProfiles.map((p) => this.statusForProfile(p)));
  }

  /**
   * Get container logs. Delegates to Instance.logs().
   */
  async logs(id: string, tail = 100): Promise<string> {
    const instance = await this.getInstance(id);
    return instance.logs(tail);
  }

  /**
   * Stream container logs in real-time (follow mode).
   * For remote bots, proxies via node-agent bot.logs command and returns a one-shot stream.
   * For local bots, delegates to Instance.logStream().
   */
  async logStream(id: string, opts: { since?: string; tail?: number }): Promise<NodeJS.ReadableStream> {
    // Check for remote node assignment first (mirrors start/stop/restart pattern)
    const remote = await this.resolveNodeId(id);
    if (remote) {
      const profile = await this.store.get(id);
      if (!profile) throw new BotNotFoundError(id);
      const result = await remote.commandBus.send(remote.nodeId, {
        type: "bot.logs",
        payload: { name: profile.name, tail: opts.tail ?? 100 },
      });
      const logData = typeof result.data === "string" ? result.data : "";
      const pt = new PassThrough();
      pt.end(logData);
      return pt;
    }

    const instance = await this.getInstance(id);
    return instance.logStream(opts);
  }

  /**
   * Get disk usage for a bot's /data volume. Delegates to Instance.getVolumeUsage().
   */
  async getVolumeUsage(id: string): Promise<{ usedBytes: number; totalBytes: number; availableBytes: number } | null> {
    try {
      const instance = await this.getInstance(id);
      return instance.getVolumeUsage();
    } catch {
      return null;
    }
  }

  /** Fields that require container recreation when changed. */
  private static readonly CONTAINER_FIELDS = new Set<string>([
    "image",
    "env",
    "restartPolicy",
    "volumeName",
    "name",
    "discovery",
    "network",
    "ephemeral",
  ]);

  /**
   * Update a bot profile. Only recreates the container if container-relevant
   * fields changed. Rolls back the profile if container recreation fails.
   */
  async update(id: string, updates: Partial<Omit<BotProfile, "id">>): Promise<BotProfile> {
    return this.withLock(id, async () => {
      const existing = await this.store.get(id);
      if (!existing) throw new BotNotFoundError(id);

      const updated: BotProfile = { ...existing, ...updates };

      const needsRecreate = Object.keys(updates).some((k) => FleetManager.CONTAINER_FIELDS.has(k));

      const container = await this.findContainer(id);
      if (container && needsRecreate) {
        const info = await container.inspect();
        const wasRunning = info.State.Running;

        // Save the updated profile only after pre-checks succeed
        if (updates.image) {
          await this.pullImage(updated.image);
        }

        await this.store.save(updated);

        try {
          if (wasRunning) {
            try {
              await container.stop();
            } catch (err) {
              logger.warn(`Failed to stop container ${id} during update`, { botId: id, err });
              throw err;
            }
          }
          try {
            await container.remove();
          } catch (err) {
            logger.warn(`Failed to remove container ${id} during update`, { botId: id, err });
            throw err;
          }
          await this.createContainer(updated);

          if (wasRunning) {
            const newContainer = await this.findContainer(id);
            if (newContainer) await newContainer.start();
          }
        } catch (err) {
          // Rollback profile to the previous state
          logger.error(`Failed to recreate container for bot ${id}, rolling back profile`, { err });
          await this.store.save(existing);
          throw err;
        }
      } else {
        // Metadata-only change or no container — just save the profile
        await this.store.save(updated);
      }

      return updated;
    });
  }

  /** Get the underlying profile store */
  get profiles(): IProfileStore {
    return this.store;
  }

  // --- Private helpers ---

  private async pullImage(image: string): Promise<void> {
    logger.info(`Pulling image ${image}`);

    // Build authconfig from environment variables if present.
    // REGISTRY_USERNAME / REGISTRY_PASSWORD / REGISTRY_SERVER are optional;
    // when set they allow pulling from private registries (e.g. ghcr.io).
    const username = process.env.REGISTRY_USERNAME;
    const password = process.env.REGISTRY_PASSWORD;
    const server = process.env.REGISTRY_SERVER;
    const authconfig = username && password ? { username, password, serveraddress: server ?? "ghcr.io" } : undefined;

    const stream = await this.docker.pull(image, authconfig ? { authconfig } : {});
    await new Promise<void>((resolve, reject) => {
      this.docker.modem.followProgress(stream, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private async createContainer(
    profile: BotProfile,
    resourceLimits?: ContainerResourceLimits,
  ): Promise<Docker.Container> {
    const restartPolicyMap: Record<string, string> = {
      no: "no",
      always: "always",
      "on-failure": "on-failure",
      "unless-stopped": "unless-stopped",
    };

    const binds: string[] = [];
    if (profile.volumeName) {
      binds.push(`${profile.volumeName}:/data`);
    }

    // Mount shared node_modules volume read-only (WOP-973)
    const sharedVolConfig = getSharedVolumeConfig();
    if (sharedVolConfig.enabled) {
      binds.push(`${sharedVolConfig.volumeName}:${sharedVolConfig.mountPath}:ro`);
    }

    const isEphemeral = profile.ephemeral === true;

    const hostConfig: Docker.ContainerCreateOptions["HostConfig"] = {
      RestartPolicy: {
        Name: restartPolicyMap[profile.restartPolicy] || "",
      },
      Binds: binds.length > 0 ? binds : undefined,
      SecurityOpt: ["no-new-privileges"],
      CapDrop: isEphemeral ? undefined : ["ALL"],
      CapAdd: isEphemeral ? undefined : ["NET_BIND_SERVICE", "CHOWN", "DAC_OVERRIDE"],
      ReadonlyRootfs: !isEphemeral,
      Tmpfs: isEphemeral
        ? undefined
        : {
            "/tmp": "rw,noexec,nosuid,size=64m",
            "/var/tmp": "rw,noexec,nosuid,size=64m",
          },
    };

    // Set network: explicit profile.network takes precedence, then NetworkPolicy
    if (profile.network) {
      hostConfig.NetworkMode = profile.network;
    } else if (this.networkPolicy) {
      const networkMode = await this.networkPolicy.prepareForContainer(profile.tenantId);
      hostConfig.NetworkMode = networkMode;
    }

    // Apply resource limits from tier if provided
    if (resourceLimits) {
      hostConfig.Memory = resourceLimits.Memory;
      hostConfig.CpuQuota = resourceLimits.CpuQuota;
      hostConfig.PidsLimit = resourceLimits.PidsLimit;
    }

    // Merge discovery env vars into the container environment.
    // discoveryEnv overrides profile.env (spread order matters).
    // Empty-string values mean "explicitly remove" — filter them out.
    const discoveryEnv = buildDiscoveryEnv(profile.discovery, this.platformDiscovery);
    const sharedNodePath = sharedVolConfig.enabled ? { NODE_PATH: sharedVolConfig.mountPath } : {};
    const mergedEnv = { ...profile.env, ...sharedNodePath, ...discoveryEnv };

    const container = await this.docker.createContainer({
      Image: profile.image,
      name: `wopr-${profile.name.replace(/_/g, "-")}`,
      Env: Object.entries(mergedEnv)
        .filter(([, v]) => v !== "")
        .map(([k, v]) => `${k}=${v}`),
      Labels: {
        [CONTAINER_LABEL]: "true",
        [CONTAINER_ID_LABEL]: profile.id,
      },
      HostConfig: hostConfig,
      Healthcheck: {
        Test: ["CMD-SHELL", "node -e 'process.exit(0)'"],
        Interval: 30_000_000_000, // 30s in nanoseconds
        Timeout: 10_000_000_000,
        Retries: 3,
        StartPeriod: 15_000_000_000,
      },
    });

    logger.info(`Created container ${container.id} for bot ${profile.id}`);
    return container;
  }

  private async findContainer(botId: string): Promise<Docker.Container | null> {
    const containers = await this.docker.listContainers({
      all: true,
      filters: {
        label: [`${CONTAINER_ID_LABEL}=${botId}`],
      },
    });

    if (containers.length === 0) return null;
    return this.docker.getContainer(containers[0].Id);
  }

  private async statusForProfile(profile: BotProfile): Promise<BotStatus> {
    try {
      const instance = await this.buildInstance(profile);
      return instance.status();
    } catch {
      // Container not found — return offline status
      const now = new Date().toISOString();
      return {
        id: profile.id,
        name: profile.name,
        description: profile.description,
        image: profile.image,
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
  }
}

export class BotNotFoundError extends Error {
  constructor(id: string) {
    super(`Bot not found: ${id}`);
    this.name = "BotNotFoundError";
  }
}
