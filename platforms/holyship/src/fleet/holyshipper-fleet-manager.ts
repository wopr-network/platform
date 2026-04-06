/**
 * HolyshipperFleetManager — provisions holyshipper worker containers via core's fleet API.
 *
 * Each invocation gets a fresh container:
 *   1. core-client fleet.createInstance → core provisions the container
 *   2. Health check via instance URL
 *   3. POST /credentials — inject gateway key + GitHub token
 *   4. POST /checkout — clone repo(s)
 *   5. Container is now ready for dispatch + gate evaluation
 *   6. core-client fleet.controlInstance(destroy) → core removes the container
 *
 * Containers are short-lived workers (no billing record, writable filesystem).
 * Token billing happens at the gateway layer, not per-instance.
 */

import { logger } from "../logger.js";
import { coreClient } from "../services/core-client.js";
import type { IFleetManager, ProvisionConfig, ProvisionResult } from "./provision-holyshipper.js";

export interface HolyshipperFleetManagerConfig {
  /** GHCR image for holyshipper workers. */
  image: string;
  /** Gateway URL for inference (e.g., "http://core:3001/v1"). */
  gatewayUrl: string;
  /** Gateway service key for authentication. */
  gatewayKey: string;
  /** Docker network to attach containers to (for /v1 access). */
  network?: string;
}

export class HolyshipperFleetManager implements IFleetManager {
  private readonly image: string;
  private readonly gatewayUrl: string;
  private readonly gatewayKey: string;
  private readonly network: string | undefined;

  constructor(config: HolyshipperFleetManagerConfig) {
    this.image = config.image;
    this.gatewayUrl = config.gatewayUrl;
    this.gatewayKey = config.gatewayKey;
    this.network = config.network;
  }

  async provision(entityId: string, config: ProvisionConfig): Promise<ProvisionResult> {
    const botName = `hs-${entityId.slice(0, 8)}-${Date.now()}`;
    const core = coreClient({ tenantId: "holyship", userId: "system", product: "holyship" });
    if (!core.fleet) {
      throw new Error("Core fleet API not available — ensure core has fleet enabled");
    }

    logger.info("[fleet] provisioning holyshipper container via core", {
      botName,
      entityId,
      owner: config.owner,
      repo: config.repo,
    });

    const env: Record<string, string> = {
      HOLYSHIP_GATEWAY_URL: this.gatewayUrl,
      HOLYSHIP_ENTITY_ID: entityId,
      PORT: "8080",
    };

    if (config.githubToken) {
      env.GH_TOKEN = config.githubToken;
      env.GITHUB_TOKEN = config.githubToken;
    }

    // Create bare container via core fleet API — returns a per-instance
    // gateway service key tied to the tenant for metered billing.
    let instance: { id: string; url: string; containerId: string; name: string; gatewayKey: string | null };
    try {
      logger.info("[fleet] calling core.fleet.createContainer", {
        botName,
        image: this.image,
        hasFleet: !!core.fleet,
      });
      instance = await core.fleet.createContainer.mutate({
        name: botName,
        image: this.image,
        productSlug: "holyship",
        env,
        network: this.network,
        restartPolicy: "no",
        readonlyRootfs: false,
      });
    } catch (err) {
      logger.error("[fleet] createContainer failed", {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      throw err;
    }

    // Use per-instance key for tenant billing; fall back to static key
    const instanceGatewayKey = instance.gatewayKey ?? this.gatewayKey;

    const containerId = instance.id;
    const runnerUrl = instance.url;

    try {
      await this.waitForReady(runnerUrl, botName);
      await this.postCredentials(runnerUrl, config, instanceGatewayKey);

      if (config.owner && config.repo) {
        await this.postCheckout(runnerUrl, config);
      }
    } catch (err) {
      logger.error("[fleet] mid-provision failure, cleaning up", {
        entityId,
        containerId: containerId.slice(0, 12),
        error: err instanceof Error ? err.message : String(err),
      });
      await this.teardown(containerId).catch(() => {});
      throw err;
    }

    logger.info("[fleet] holyshipper container ready", {
      botName,
      entityId,
      containerId: containerId.slice(0, 12),
      runnerUrl,
    });

    return { containerId, runnerUrl };
  }

  async teardown(containerId: string): Promise<void> {
    logger.info("[fleet] tearing down holyshipper container via core", {
      containerId: containerId.slice(0, 12),
    });

    const core = coreClient({ tenantId: "holyship", userId: "system", product: "holyship" });
    if (!core.fleet) {
      logger.warn("[fleet] core fleet API not available for teardown");
      return;
    }

    try {
      await core.fleet.controlInstance.mutate({ id: containerId, action: "destroy" });
    } catch (err) {
      logger.warn("[fleet] teardown failed — container may already be gone", {
        containerId: containerId.slice(0, 12),
        error: (err as Error).message,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers (direct HTTP to holyshipper container — not through core)
  // ---------------------------------------------------------------------------

  private async waitForReady(runnerUrl: string, botName: string, timeoutMs = 30_000): Promise<void> {
    const start = Date.now();
    const interval = 1000;

    while (Date.now() - start < timeoutMs) {
      try {
        const res = await fetch(`${runnerUrl}/health`, {
          signal: AbortSignal.timeout(2000),
        });
        if (res.ok) return;
      } catch {
        // Not ready yet
      }
      await new Promise((r) => setTimeout(r, interval));
    }

    throw new Error(`Container ${botName} did not become ready within ${timeoutMs}ms`);
  }

  private async postCredentials(runnerUrl: string, config: ProvisionConfig, gatewayKey: string): Promise<void> {
    const body: Record<string, unknown> = {
      gateway: { key: gatewayKey },
      gatewayUrl: this.gatewayUrl,
    };
    if (config.githubToken) {
      body.github = { token: config.githubToken };
    }

    const res = await fetch(`${runnerUrl}/credentials`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Credential injection failed: HTTP ${res.status} — ${text}`);
    }

    logger.info("[fleet] credentials injected", { entityId: config.entityId });
  }

  private async postCheckout(runnerUrl: string, config: ProvisionConfig): Promise<void> {
    const repoFullName = config.owner && config.repo ? `${config.owner}/${config.repo}` : undefined;
    if (!repoFullName) return;

    const res = await fetch(`${runnerUrl}/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repo: repoFullName,
        entityId: config.entityId,
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Checkout failed: HTTP ${res.status} — ${text}`);
    }

    logger.info("[fleet] repo checked out", {
      entityId: config.entityId,
      repo: repoFullName,
    });
  }
}
