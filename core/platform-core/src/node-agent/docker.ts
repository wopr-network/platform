import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import Docker from "dockerode";

/**
 * Auth payload for a private registry — passed to dockerode's pull as
 * `authconfig`. The agent constructs one of these from its own env at boot
 * time and uses it as the default for every pull, so individual handlers
 * (and the operations they're claimed from) don't need to embed credentials.
 *
 * Per-call payloads (`pool.warm` with an explicit `registryAuth`) still
 * override the default.
 */
export interface RegistryAuth {
  username: string;
  password: string;
  serveraddress: string;
}

export interface DockerManagerOptions {
  /** Default registry auth used by all pulls when the per-call payload doesn't override. */
  defaultRegistryAuth?: RegistryAuth | null;
}

/**
 * Thin wrapper around Dockerode that exposes only the operations the node
 * agent needs. Uses the Docker SDK exclusively -- no child_process.exec.
 */
export class DockerManager {
  readonly docker: Docker;
  private readonly defaultRegistryAuth: RegistryAuth | null;

  constructor(docker?: Docker, options: DockerManagerOptions = {}) {
    this.docker = docker ?? new Docker({ socketPath: "/var/run/docker.sock" });
    this.defaultRegistryAuth = options.defaultRegistryAuth ?? null;
  }

  /**
   * Resolve pull options. If the caller passed an explicit `registryAuth`
   * (per-image override), use that. Otherwise fall back to the agent's
   * default registry auth (set at boot time from env). Returns an empty
   * options object when neither is set — dockerode will attempt an
   * unauthenticated pull, which is correct for public images.
   */
  private pullOpts(override?: RegistryAuth | null): { authconfig?: RegistryAuth } {
    const auth = override ?? this.defaultRegistryAuth;
    return auth ? { authconfig: auth } : {};
  }

  /**
   * List tenant containers managed by this agent.
   *
   * Filter rule: containers tagged `wopr.managed=true` whose name does NOT
   * start with the `pool-` prefix (those are still in the warm pool).
   * Pool containers carry the same `wopr.managed` label so the agent owns
   * them too — they're filtered out here so backups/heartbeat metrics only
   * cover claimed tenant instances, not the warm pool.
   */
  async listTenantContainers(): Promise<Docker.ContainerInfo[]> {
    const all = await this.docker.listContainers({ all: true });
    return all.filter((c) => {
      if (c.Labels?.["wopr.managed"] !== "true") return false;
      const name = (c.Names?.[0] ?? "").replace(/^\//, "");
      return !name.startsWith("pool-");
    });
  }

  /** Start a new tenant container. Name is used as-given — caller owns the convention. */
  async startBot(payload: {
    name: string;
    image: string;
    env?: Record<string, string>;
    restart?: string;
  }): Promise<string> {
    const { name } = payload;
    const envArr = payload.env ? Object.entries(payload.env).map(([k, v]) => `${k}=${v}`) : [];

    // Pull image first (uses agent default registry auth if available).
    const stream = await this.docker.pull(payload.image, this.pullOpts());
    await new Promise<void>((resolve, reject) => {
      this.docker.modem.followProgress(stream, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const container = await this.docker.createContainer({
      Image: payload.image,
      name,
      Env: envArr,
      Labels: { "wopr.managed": "true" },
      HostConfig: {
        RestartPolicy: { Name: payload.restart ?? "unless-stopped" },
      },
    });

    await container.start();
    return container.id;
  }

  /** Stop a tenant container by name. */
  async stopBot(name: string): Promise<void> {
    const container = this.docker.getContainer(name);
    await container.stop();
  }

  /** Restart a tenant container by name. */
  async restartBot(name: string): Promise<void> {
    const container = this.docker.getContainer(name);
    await container.restart();
  }

  /**
   * Update a bot's environment variables by recreating its container.
   * Docker does not support modifying env on a running container,
   * so we: inspect -> stop -> remove -> create+start with new env.
   */
  async updateBotEnv(name: string, env: Record<string, string>): Promise<string> {
    const container = this.docker.getContainer(name);
    const info = await container.inspect();

    const image = info.Config.Image;
    const restartPolicy = info.HostConfig?.RestartPolicy?.Name ?? "unless-stopped";

    // Stop and remove old container
    try {
      await container.stop();
    } catch (err) {
      // Docker 304: container already stopped — not an error
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("container already stopped")) throw err;
    }
    await container.remove();

    // Recreate with new env
    return this.startBot({ name, image, env, restart: restartPolicy });
  }

  /**
   * Update a running bot's environment by replacing its container.
   * Steps: inspect old -> stop old -> remove old -> create new -> start new.
   * On failure after removal, attempt to recreate the old container.
   * No image pull — uses the image already cached on the node.
   */
  async updateBot(payload: { name: string; env: Record<string, string> }): Promise<{ containerId: string }> {
    const { name } = payload;
    const container = this.docker.getContainer(name);

    // Inspect old container to capture image + config for rollback
    const info = await container.inspect();
    const image = info.Config.Image;
    const oldEnv = info.Config.Env ?? [];
    const restartPolicy = info.HostConfig?.RestartPolicy?.Name ?? "unless-stopped";

    // Stop the old container (ignore error if already stopped)
    try {
      await container.stop();
    } catch (err) {
      // Docker 304: container already stopped — not an error
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("container already stopped")) throw err;
    }

    // Remove the old container
    await container.remove();

    // Create new container with updated env
    const envArr = Object.entries(payload.env).map(([k, v]) => `${k}=${v}`);

    try {
      const newContainer = await this.docker.createContainer({
        Image: image,
        name,
        Env: envArr,
        Labels: { "wopr.managed": "true" },
        HostConfig: {
          RestartPolicy: { Name: restartPolicy },
        },
      });

      await newContainer.start();
      return { containerId: newContainer.id };
    } catch (err) {
      // Rollback: recreate old container with original env and start it
      try {
        const rollback = await this.docker.createContainer({
          Image: image,
          name,
          Env: oldEnv,
          Labels: { "wopr.managed": "true" },
          HostConfig: {
            RestartPolicy: { Name: restartPolicy },
          },
        });
        await rollback.start();
      } catch {
        // Rollback failed — container is gone. Caller handles.
      }
      throw err;
    }
  }

  /**
   * Rename a container by ID. Used by HotPool claims to rebrand a warm
   * pool container (pool-foo-XYZ) into a tenant container (tenant_<id>).
   *
   * Swarm overlay networks key DNS endpoints by name, so a bare `rename`
   * leaves a stale endpoint and the next attach blows up with
   * "endpoint_table ... already exists". We disconnect from each network,
   * rename, then reconnect with the new name.
   *
   * Returns the (unchanged) container ID — Docker rename only swaps names.
   */
  async renameContainer(containerId: string, newName: string): Promise<{ containerId: string }> {
    const name = newName;
    const container = this.docker.getContainer(containerId);

    // Snapshot networks before rename so we can reconnect on failure or success.
    const info = await container.inspect();
    const networks = Object.keys(info.NetworkSettings?.Networks ?? {});

    // Disconnect from each network so the swarm endpoint table is freed.
    for (const net of networks) {
      try {
        await this.docker.getNetwork(net).disconnect({ Container: containerId, Force: true });
      } catch {
        // Already disconnected or network gone — non-fatal
      }
    }

    try {
      await container.rename({ name });
    } catch (err) {
      // Rename failed — restore the original network attachments so the
      // container is back in its pre-rename state and can be retried/cleaned up.
      for (const net of networks) {
        try {
          await this.docker.getNetwork(net).connect({ Container: containerId });
        } catch {
          /* best effort */
        }
      }
      throw err;
    }

    // Reconnect to each network with the new name registered.
    for (const net of networks) {
      try {
        await this.docker.getNetwork(net).connect({ Container: containerId });
      } catch {
        // Reconnect failure is non-fatal but logged at the connect site by docker
      }
    }

    return { containerId };
  }

  /** Remove a tenant container by name. */
  async removeBot(name: string): Promise<void> {
    const container = this.docker.getContainer(name);
    try {
      await container.stop();
    } catch (err) {
      // Docker 304: container already stopped — not an error
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("container already stopped")) throw err;
    }
    await container.remove();
  }

  /** Export a container to a tar.gz file in backupDir. Returns the file path. */
  async exportBot(name: string, backupDir: string): Promise<string> {
    const outPath = join(backupDir, `${name}.tar.gz`);
    await mkdir(dirname(outPath), { recursive: true });

    const container = this.docker.getContainer(name);
    const exportStream = await container.export();

    // Dockerode export returns a raw tar stream. We write it directly.
    // For gzip compression we use node:zlib through a transform.
    const { createGzip } = await import("node:zlib");
    const gzip = createGzip();
    const fileStream = createWriteStream(outPath);

    await pipeline(exportStream as unknown as NodeJS.ReadableStream, gzip, fileStream);
    return outPath;
  }

  /** Import a tar.gz and create+start a container from it. */
  async importBot(name: string, backupDir: string, image: string, env?: Record<string, string>): Promise<string> {
    const tarPath = join(backupDir, `${name}.tar.gz`);
    const { createReadStream } = await import("node:fs");
    const { createGunzip } = await import("node:zlib");

    const gunzip = createGunzip();
    const fileStream = createReadStream(tarPath);

    // Import the tar as a new Docker image
    const importStream = await this.docker.importImage(fileStream.pipe(gunzip) as unknown as NodeJS.ReadableStream);
    await new Promise<void>((resolve, reject) => {
      this.docker.modem.followProgress(importStream, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Create and start a new container from the imported image
    const containerName = name;
    const envArr = env ? Object.entries(env).map(([k, v]) => `${k}=${v}`) : [];

    const container = await this.docker.createContainer({
      Image: image,
      name: containerName,
      Env: envArr,
      Labels: { "wopr.managed": "true" },
      HostConfig: {
        RestartPolicy: { Name: "unless-stopped" },
      },
    });

    await container.start();
    return container.id;
  }

  /** Get container logs (last N lines). */
  async getLogs(name: string, tail = 100): Promise<string> {
    const container = this.docker.getContainer(name);
    const logs = await container.logs({
      stdout: true,
      stderr: true,
      tail,
      timestamps: true,
    });
    return logs.toString("utf-8");
  }

  /** Inspect a container and return its full info. */
  async inspectBot(name: string): Promise<Docker.ContainerInspectInfo> {
    const container = this.docker.getContainer(name);
    return container.inspect();
  }

  /**
   * Create a warm pool container — pre-provisioned and ready to claim.
   * Mirrors HotPool.createWarm() logic: init volume, wrap entrypoint, connect network.
   */
  async createWarmContainer(payload: {
    name: string;
    image: string;
    port: number;
    network: string;
    provisionSecret?: string;
    registryAuth?: { username: string; password: string; serveraddress: string };
  }): Promise<string> {
    const { name, image, port, network, provisionSecret, registryAuth } = payload;
    const volumeName = name; // volume matches container name

    // Pull image — per-call `registryAuth` overrides the agent's default.
    const stream = await this.docker.pull(image, this.pullOpts(registryAuth));
    await new Promise<void>((resolve, reject) => {
      this.docker.modem.followProgress(stream, (err: Error | null) => (err ? reject(err) : resolve()));
    });

    // Init volume — clear stale embedded-PG data
    const init = await this.docker.createContainer({
      Image: image,
      Entrypoint: ["/bin/sh", "-c"],
      Cmd: ["rm -rf /data/* /data/.* 2>/dev/null; chown -R 999:999 /data || true"],
      User: "root",
      HostConfig: { Binds: [`${volumeName}:/data`] },
    });
    await init.start();
    await init.wait();
    await init.remove();

    // Wrap original entrypoint with cleanup
    const imageInfo = await this.docker.getImage(image).inspect();
    const rawEntrypoint: string[] = Array.isArray(imageInfo.Config?.Entrypoint) ? imageInfo.Config.Entrypoint : [];
    const rawCmd: string[] = Array.isArray(imageInfo.Config?.Cmd) ? imageInfo.Config.Cmd : [];
    const fullCmd = [...rawEntrypoint, ...rawCmd].join(" ");
    const cleanupAndExec = `rm -rf /paperclip/instances/default/db 2>/dev/null; exec ${fullCmd}`;

    const env = [`PORT=${port}`, "HOME=/data"];
    if (provisionSecret) env.push(`WOPR_PROVISION_SECRET=${provisionSecret}`);

    const container = await this.docker.createContainer({
      Image: image,
      name,
      Entrypoint: ["/bin/sh", "-c"],
      Cmd: [cleanupAndExec],
      Env: env,
      Labels: { "wopr.managed": "true" },
      HostConfig: {
        Binds: [`${volumeName}:/data`],
        RestartPolicy: { Name: "on-failure", MaximumRetryCount: 3 },
      },
    });

    await container.start();

    // Connect to overlay network
    try {
      const net = this.docker.getNetwork(network);
      await net.connect({ Container: container.id });
    } catch {
      // Network connect failure is non-fatal — container still runs
    }

    return container.id;
  }

  /**
   * List all pool containers on this node (name starts with "pool-").
   * Returns minimal info for orphan reconciliation.
   */
  async listPoolContainers(): Promise<{ id: string; name: string; running: boolean }[]> {
    const all = await this.docker.listContainers({ all: true });
    return all
      .filter((c) => c.Names?.some((n) => n.replace(/^\//, "").startsWith("pool-")))
      .map((c) => ({
        id: c.Id,
        name: (c.Names?.[0] ?? "").replace(/^\//, ""),
        running: c.State === "running",
      }));
  }

  /** Get Docker event stream for monitoring container lifecycle. */
  async getEventStream(opts?: { filters?: Record<string, string[]> }): Promise<NodeJS.ReadableStream> {
    return this.docker.getEvents({
      filters: opts?.filters ?? { type: ["container"] },
    }) as unknown as Promise<NodeJS.ReadableStream>;
  }
}
