import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import Docker from "dockerode";
import { logger } from "../config/logger.js";

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
  /**
   * Default docker network to attach spawned containers to (after start).
   * The host's per-instance compose stack is on a swarm overlay network like
   * `platform-overlay`; tenant containers MUST join it to be reachable from
   * the core service by name. Without this, containers land on the default
   * `bridge` network and core can't curl them for the sidecar health check.
   *
   * Per-call payloads can still override (warm pool spec carries its own
   * network field per-product); this is the fallback for everything else.
   */
  defaultNetwork?: string | null;
}

/**
 * Convert the raw `.Mounts` from docker inspect into the
 * `HostConfig.Mounts` shape accepted by createContainer. Preserves both
 * bind mounts (Source = host path) and named/anonymous volumes
 * (Source = volume name). Skips entries that lack the info we need.
 */
function snapshotMounts(raw: Docker.ContainerInspectInfo["Mounts"] | undefined): Docker.MountSettings[] {
  return (raw ?? [])
    .map((m): Docker.MountSettings | null => {
      if (m.Type === "bind" && m.Source) {
        return { Type: "bind", Source: m.Source, Target: m.Destination, ReadOnly: m.RW === false };
      }
      if (m.Name) {
        return { Type: "volume", Source: m.Name, Target: m.Destination, ReadOnly: m.RW === false };
      }
      return null;
    })
    .filter((m): m is Docker.MountSettings => m !== null);
}

/**
 * Thin wrapper around Dockerode that exposes only the operations the node
 * agent needs. Uses the Docker SDK exclusively -- no child_process.exec.
 */
export class DockerManager {
  readonly docker: Docker;
  private readonly defaultRegistryAuth: RegistryAuth | null;
  private readonly defaultNetwork: string | null;

  constructor(docker?: Docker, options: DockerManagerOptions = {}) {
    this.docker = docker ?? new Docker({ socketPath: "/var/run/docker.sock" });
    this.defaultRegistryAuth = options.defaultRegistryAuth ?? null;
    this.defaultNetwork = options.defaultNetwork ?? null;
  }

  /**
   * Attach a container to a docker network if one is configured. Same fallback
   * shape as `pullOpts`: per-call override → agent default → no-op. Failures
   * are logged-non-fatal because a container that fails to join the overlay
   * still runs (just not reachable from sibling services), and we'd rather
   * the create succeed and surface the connectivity issue at health-check time
   * than crash the entire create flow.
   */
  private async attachNetwork(containerId: string, override?: string | null): Promise<void> {
    const network = override ?? this.defaultNetwork;
    if (!network) return;
    try {
      const net = this.docker.getNetwork(network);
      await net.connect({ Container: containerId });
      logger.info("DockerManager.attachNetwork: attached", { containerId, network });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // "already connected" is fine; anything else is a real problem that will
      // cause ENOTFOUND at health-check time — log it so we can diagnose.
      if (/already exists|endpoint with name/i.test(msg)) {
        logger.info("DockerManager.attachNetwork: already connected", { containerId, network, msg });
      } else {
        logger.warn("DockerManager.attachNetwork: failed to attach — container will be unreachable on overlay", {
          containerId,
          network,
          msg,
          err,
        });
      }
    }
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
   * start with the `warm-` prefix (those are still in the warm pool).
   * Pool containers carry the same `wopr.managed` label so the agent owns
   * them too — they're filtered out here so backups/heartbeat metrics only
   * cover claimed tenant instances, not the warm pool.
   */
  async listTenantContainers(): Promise<Docker.ContainerInfo[]> {
    const all = await this.docker.listContainers({ all: true });
    return all.filter((c) => {
      if (c.Labels?.["wopr.managed"] !== "true") return false;
      const name = (c.Names?.[0] ?? "").replace(/^\//, "");
      return !name.startsWith("warm-");
    });
  }

  /** Start a new tenant container. Name is used as-given — caller owns the convention. */
  async startBot(payload: {
    name: string;
    image: string;
    env?: Record<string, string>;
    restart?: string;
    /** Optional override of the agent's default network. */
    network?: string;
  }): Promise<string> {
    const { name } = payload;
    const envArr = payload.env ? Object.entries(payload.env).map(([k, v]) => `${k}=${v}`) : [];

    logger.info("DockerManager.startBot: pulling image", { name, image: payload.image });
    const stream = await this.docker.pull(payload.image, this.pullOpts());
    await new Promise<void>((resolve, reject) => {
      this.docker.modem.followProgress(stream, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
    logger.info("DockerManager.startBot: image ready", { name, image: payload.image });

    const container = await this.docker.createContainer({
      Image: payload.image,
      name,
      Env: envArr,
      Labels: { "wopr.managed": "true" },
      HostConfig: {
        RestartPolicy: { Name: payload.restart ?? "unless-stopped" },
      },
    });
    logger.info("DockerManager.startBot: container created", { name, containerId: container.id });

    await container.start();
    logger.info("DockerManager.startBot: container started", { name, containerId: container.id });

    // Attach the tenant container to the host's overlay network so core can
    // reach it by name for the sidecar health check + tRPC proxy. Without
    // this the container is reachable only on the default `bridge` network
    // and `http://<name>:3100` from core resolves to nothing.
    await this.attachNetwork(container.id, payload.network);

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
    const networkNames = Object.keys(info.NetworkSettings?.Networks ?? {});
    const mounts = snapshotMounts(info.Mounts);

    // Stop and remove old container
    try {
      await container.stop();
    } catch (err) {
      const statusCode = (err as { statusCode?: number })?.statusCode;
      if (statusCode !== 304) throw err;
    }
    await container.remove();

    // Recreate preserving mounts + networks so stateful containers keep
    // their data and overlay membership across env updates.
    const envArr = Object.entries(env).map(([k, v]) => `${k}=${v}`);
    const newContainer = await this.docker.createContainer({
      Image: image,
      name,
      Env: envArr,
      Labels: { "wopr.managed": "true" },
      HostConfig: {
        RestartPolicy: { Name: restartPolicy },
        Mounts: mounts,
      },
    });
    await newContainer.start();
    await this.reattachNetworks(newContainer.id, networkNames);
    return newContainer.id;
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
    const networkNames = Object.keys(info.NetworkSettings?.Networks ?? {});
    const mounts = snapshotMounts(info.Mounts);

    // Stop the old container (ignore error if already stopped)
    try {
      await container.stop();
    } catch (err) {
      const statusCode = (err as { statusCode?: number })?.statusCode;
      if (statusCode !== 304) throw err;
    }

    // Remove the old container
    await container.remove();

    // Create new container with updated env — preserve mounts + networks
    // so stateful containers keep their data and overlay membership.
    const envArr = Object.entries(payload.env).map(([k, v]) => `${k}=${v}`);
    const hostConfig: Docker.HostConfig = {
      RestartPolicy: { Name: restartPolicy },
      Mounts: mounts,
    };

    try {
      const newContainer = await this.docker.createContainer({
        Image: image,
        name,
        Env: envArr,
        Labels: { "wopr.managed": "true" },
        HostConfig: hostConfig,
      });

      await newContainer.start();
      await this.reattachNetworks(newContainer.id, networkNames);
      return { containerId: newContainer.id };
    } catch (err) {
      // Rollback: recreate old container with original env + mounts + nets
      try {
        const rollback = await this.docker.createContainer({
          Image: image,
          name,
          Env: oldEnv,
          Labels: { "wopr.managed": "true" },
          HostConfig: hostConfig,
        });
        await rollback.start();
        await this.reattachNetworks(rollback.id, networkNames);
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

  /**
   * Roll a running tenant container to the latest image.
   *
   * Inspects the existing container to capture its image tag, env, and
   * restart policy, pulls the image (refreshes the tag to the newest digest
   * in the registry), then stop+remove+recreate. Useful when a rebuilt
   * :managed image has been pushed and running user containers need to pick
   * it up without manual docker pokes.
   *
   * No image-tag change: this rolls the exact same tag the container was
   * created with. Use startBot for a brand new container with a different
   * image.
   */
  async rollBot(name: string): Promise<{ containerId: string; image: string }> {
    const container = this.docker.getContainer(name);
    const info = await container.inspect();
    const image = info.Config.Image;
    const env = info.Config.Env ?? [];
    const restartPolicy = info.HostConfig?.RestartPolicy?.Name ?? "unless-stopped";
    // Capture every network the old container was connected to (including
    // per-instance overlays) so we can reattach the replacement to the same
    // set. Without this a replacement could come up unreachable even though
    // the original was routable.
    const networkNames = Object.keys(info.NetworkSettings?.Networks ?? {});
    // Capture every mount so stateful containers don't lose their data on
    // roll. Named + anonymous volumes translate to --mount source=<vol>,
    // bind mounts translate to --mount type=bind,source=<host path>. For
    // anonymous volumes created via VOLUME directive, reusing the volume
    // name keeps the existing contents attached to the new container.
    const mounts = snapshotMounts(info.Mounts);

    // Pull the (potentially refreshed) image before recreating so the new
    // container actually uses the latest digest for this tag.
    const stream = await this.docker.pull(image, this.pullOpts());
    await new Promise<void>((resolve, reject) => {
      this.docker.modem.followProgress(stream, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });

    try {
      await container.stop();
    } catch (err) {
      // Docker returns 304 when the container is already stopped. Rely on
      // the API status code instead of matching the error string — message
      // wording varies across dockerode / daemon versions and locales.
      const statusCode = (err as { statusCode?: number })?.statusCode;
      if (statusCode !== 304) throw err;
    }
    await container.remove();

    const createOpts: Docker.ContainerCreateOptions = {
      Image: image,
      name,
      Env: env,
      Labels: { "wopr.managed": "true" },
      HostConfig: {
        RestartPolicy: { Name: restartPolicy },
        Mounts: mounts,
      },
    };

    try {
      const newContainer = await this.docker.createContainer(createOpts);
      await newContainer.start();
      // Reattach every network the original container was on. If no networks
      // were recorded (old container had been manually disconnected) fall
      // back to the agent default.
      await this.reattachNetworks(newContainer.id, networkNames);
      return { containerId: newContainer.id, image };
    } catch (err) {
      // Recreate attempt failed AFTER we removed the old container — try to
      // restore something running so the tenant isn't left bot-less, then
      // rethrow the original error. Mirrors the rollback path in updateBot.
      try {
        const rollback = await this.docker.createContainer(createOpts);
        await rollback.start();
        // Reapply the full network set — not just defaultNetwork — otherwise
        // the recovered container is alive but unreachable from core.
        await this.reattachNetworks(rollback.id, networkNames);
      } catch {
        // Nothing we can do — the caller's error is more useful than ours.
      }
      throw err;
    }
  }

  /**
   * Reconnect a freshly-created container to the same set of networks an
   * earlier container was attached to. If the captured list is empty, fall
   * back to the agent's default network.
   */
  private async reattachNetworks(containerId: string, networkNames: string[]): Promise<void> {
    if (networkNames.length === 0) {
      await this.attachNetwork(containerId);
      return;
    }
    for (const networkName of networkNames) {
      try {
        await this.docker.getNetwork(networkName).connect({ Container: containerId });
      } catch (err) {
        // Default bridge / host networks are auto-connected by Docker
        // at start — reconnect is a no-op 403 in that case.
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode !== 403) throw err;
      }
    }
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
   * Compare the image ID the container is currently running against the
   * image ID currently associated with that tag on this node.
   *
   * Used by the "update available" banner: if a newer version of the
   * :managed image has been pulled (e.g. by a recent deploy) but the
   * user's container is still on the old image ID, we offer them an
   * opt-in roll.
   *
   * Returns null for `latestImageId` if the tag isn't resolvable locally
   * (which means there's no newer image to compare against).
   */
  async checkBotVersion(
    name: string,
  ): Promise<{ upToDate: boolean; currentImageId: string; latestImageId: string | null; tag: string }> {
    const container = this.docker.getContainer(name);
    const info = await container.inspect();
    const tag = info.Config.Image;
    const currentImageId = info.Image;
    let latestImageId: string | null = null;
    try {
      const img = await this.docker.getImage(tag).inspect();
      latestImageId = img.Id;
    } catch (err) {
      // Dockerode throws `statusCode: 404` when the tag isn't resolvable
      // locally — that's the expected "no newer version known" path.
      // Anything else (daemon outage, permission denied) is real; log it
      // so we don't silently report stale containers as up to date.
      const statusCode = (err as { statusCode?: number })?.statusCode;
      if (statusCode !== 404) {
        logger.warn("checkBotVersion: unexpected image inspect error", {
          name,
          tag,
          statusCode,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      latestImageId = null;
    }
    return {
      upToDate: latestImageId === null || latestImageId === currentImageId,
      currentImageId,
      latestImageId,
      tag,
    };
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

    // Connect to overlay network — per-call `network` from the spec wins,
    // falls back to the agent's default. Same shape as startBot().
    await this.attachNetwork(container.id, network);

    return container.id;
  }

  /**
   * List all warm pool containers on this node (name starts with "warm-").
   * Returns minimal info for orphan reconciliation. Used by Fleet.cleanupWarmPool
   * to compare host state with pool_instances DB rows in both directions.
   */
  async listPoolContainers(): Promise<{ id: string; name: string; running: boolean }[]> {
    const all = await this.docker.listContainers({ all: true });
    return all
      .filter((c) => c.Names?.some((n) => n.replace(/^\//, "").startsWith("warm-")))
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
