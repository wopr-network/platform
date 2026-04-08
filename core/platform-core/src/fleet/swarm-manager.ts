/**
 * SwarmManager — ensures Docker Swarm is initialized on the core host
 * and provides worker join tokens for remote nodes.
 *
 * Swarm is used ONLY for overlay networking (cross-host container DNS).
 * We do NOT use swarm services — containers are still created directly
 * via docker create with --network platform.
 *
 * The worker join token is stored in Vault at shared/swarm so it never
 * touches disk or process.env.
 */

import type Docker from "dockerode";
import { logger } from "../config/logger.js";
import type { VaultConfigProvider } from "../config/vault-provider.js";

const VAULT_SWARM_PATH = "shared/swarm";
const OVERLAY_NETWORK = "platform";

export interface SwarmState {
  /** Whether this host is a swarm manager. */
  isManager: boolean;
  /** The overlay network name. */
  network: string;
  /** Worker join token (only available to the manager). */
  workerToken: string | null;
  /** Manager IP:port for swarm join. */
  managerAddr: string | null;
}

export class SwarmManager {
  constructor(
    private readonly docker: Docker,
    private readonly vault: VaultConfigProvider | null,
    private readonly managerHost: string,
  ) {}

  /**
   * Ensure swarm is initialized and overlay network exists.
   * Called once at core boot. Idempotent.
   *
   * 1. Check if already in a swarm
   * 2. If not: docker swarm init
   * 3. Ensure overlay network exists
   * 4. Store worker token in Vault
   */
  async ensureSwarm(): Promise<SwarmState> {
    let isManager = false;
    let workerToken: string | null = null;

    // Check current swarm status
    try {
      const info = await this.docker.swarmInspect();
      isManager = true;
      logger.info("Swarm already initialized", { nodeId: info.ID });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes("not a swarm manager") ||
        msg.includes("not part of a swarm") ||
        msg.includes("This node is not a swarm manager")
      ) {
        logger.info("Swarm not initialized, initializing...");
        await this.docker.swarmInit({
          ListenAddr: "0.0.0.0:2377",
          AdvertiseAddr: `${this.managerHost}:2377`,
        });
        isManager = true;
        logger.info("Swarm initialized", { advertiseAddr: `${this.managerHost}:2377` });
      } else {
        throw err;
      }
    }

    // Get worker join token
    if (isManager) {
      const swarm = await this.docker.swarmInspect();
      const joinTokens = swarm.JoinTokens as { Worker?: string; Manager?: string } | undefined;
      workerToken = joinTokens?.Worker ?? null;

      if (workerToken) {
        await this.storeTokenInVault(workerToken);
      }
    }

    // Ensure overlay network exists
    await this.ensureOverlayNetwork();

    return {
      isManager,
      network: OVERLAY_NETWORK,
      workerToken,
      managerAddr: isManager ? `${this.managerHost}:2377` : null,
    };
  }

  /**
   * Get the worker join token + manager address for provisioning new nodes.
   * Reads from Vault (not Docker) so non-manager hosts can also provision.
   */
  async getJoinCredentials(): Promise<{ workerToken: string; managerAddr: string }> {
    if (!this.vault) {
      throw new Error("Vault not configured — cannot retrieve swarm join token");
    }
    const data = await this.vault.read(VAULT_SWARM_PATH);
    if (!data.worker_token || !data.manager_addr) {
      throw new Error("Swarm join credentials not found in Vault — has swarm been initialized?");
    }
    return { workerToken: data.worker_token, managerAddr: data.manager_addr };
  }

  /** Store swarm join token in Vault. */
  private async storeTokenInVault(workerToken: string): Promise<void> {
    if (!this.vault) {
      logger.warn("Vault not configured — swarm token not persisted. Remote nodes will need manual join.");
      return;
    }

    await this.vault.write(VAULT_SWARM_PATH, {
      worker_token: workerToken,
      manager_addr: `${this.managerHost}:2377`,
      network: OVERLAY_NETWORK,
    });

    logger.info("Swarm worker token stored in Vault", { path: VAULT_SWARM_PATH });
  }

  /** Create the overlay network if it doesn't exist. */
  private async ensureOverlayNetwork(): Promise<void> {
    const networks = await this.docker.listNetworks({ filters: { name: [OVERLAY_NETWORK] } });
    const existing = networks.find((n) => n.Name === OVERLAY_NETWORK);

    if (existing) {
      if (existing.Driver === "overlay") {
        logger.info("Overlay network exists", { name: OVERLAY_NETWORK });
        return;
      }
      // Network exists but isn't overlay (e.g., bridge from single-node era).
      // We can't change the driver — leave it and log a warning.
      logger.warn("Network exists but is not overlay — cross-host DNS won't work", {
        name: OVERLAY_NETWORK,
        driver: existing.Driver,
      });
      return;
    }

    await this.docker.createNetwork({
      Name: OVERLAY_NETWORK,
      Driver: "overlay",
      Attachable: true, // allows docker run --network to attach
      IPAM: { Driver: "default" },
    });
    logger.info("Created overlay network", { name: OVERLAY_NETWORK });
  }
}
