/**
 * InstanceService — orchestrates the full instance lifecycle.
 *
 * Single entry point for the full instance lifecycle: create, destroy, budget.
 * Fleet handles container acquisition (including pool). This service
 * handles credit checks, provisioning, billing, node placement, and cleanup.
 */

import { logger } from "../config/logger.js";
import { Credit } from "../credits/index.js";
import type { ILedger } from "../credits/ledger.js";
import type { IServiceKeyRepository } from "../gateway/service-key-repository.js";
import type { ProductConfig } from "../product-config/index.js";
import type { IBotInstanceRepository } from "./bot-instance-repository.js";
import type { IFleet } from "./i-fleet.js";
import type { IProfileStore } from "./profile-store.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateInstanceParams {
  tenantId: string;
  userId: string;
  userEmail: string;
  name: string;
  description?: string;
  productSlug: string;
  productConfig: ProductConfig;
  env?: Record<string, string>;
  /** Product-specific data passed through to sidecar provisioning via `extra`. */
  extra?: Record<string, unknown>;
}

export interface CreatedInstance {
  id: string;
  name: string;
  tenantId: string;
  nodeId: string;
  containerUrl: string;
  gatewayKey: string | null;
  provisioned: boolean;
}

export interface InstanceServiceDeps {
  creditLedger: ILedger;
  profileStore: IProfileStore;
  botInstanceRepo: IBotInstanceRepository;
  serviceKeyRepo: IServiceKeyRepository | null;
  provisionSecret: string | null;
  /**
   * The Fleet composite. Hides node placement, pool claim, and per-node
   * dispatch behind one IFleet interface — InstanceService never iterates
   * nodes or knows which one will be picked.
   */
  fleet: IFleet;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class InstanceService {
  constructor(private readonly deps: InstanceServiceDeps) {}

  async create(params: CreateInstanceParams): Promise<CreatedInstance> {
    const { tenantId, userId, userEmail, name, description, productSlug, productConfig, env } = params;
    const d = this.deps;

    const fleetConfig = productConfig.fleet;
    const image = fleetConfig?.containerImage;
    if (!image) throw new Error(`No container image configured for product ${productSlug}`);
    const containerPort = fleetConfig?.containerPort ?? 3000;

    logger.info("Instance.create: starting", { tenantId, userId, name, productSlug, image, containerPort });

    // 1. Credit check
    const balance = await d.creditLedger.balance(tenantId);
    logger.info("Instance.create: credit check", { tenantId, balance: balance.toCentsRounded(), minimum: 17 });
    if (balance.lessThan(Credit.fromCents(17))) {
      throw new Error(`Insufficient credits: ${balance.toCentsRounded()}¢ (need 17¢ minimum)`);
    }

    // 2. Instance limit check
    const maxInstances = fleetConfig?.maxInstances ?? 0;
    if (maxInstances > 0) {
      const profiles = await d.profileStore.list();
      const tenantInstances = profiles.filter((p) => p.tenantId === tenantId);
      if (tenantInstances.length >= maxInstances) {
        throw new Error(`Instance limit reached: maximum ${maxInstances} per tenant`);
      }
    }

    // 3. Acquire container via the Fleet composite. Placement, pool claim,
    // and per-node dispatch all happen inside fleet.create — InstanceService
    // doesn't know or care which node was picked until the result comes back.
    const instanceEnv: Record<string, string> = { ...env };
    if (d.provisionSecret) {
      instanceEnv.WOPR_PROVISION_SECRET = d.provisionSecret;
    }

    const result = await d.fleet.create({
      tenantId,
      name,
      description: description ?? "",
      image,
      productSlug,
      env: instanceEnv,
      restartPolicy: "unless-stopped",
      releaseChannel: "stable",
      updatePolicy: "manual",
    });
    const instanceId = result.id;
    const nodeId = result.nodeId;
    logger.info("Instance.create: container created", { instanceId, productSlug, nodeId });

    // From here on, anything that throws must roll back the container,
    // bot_instances row, and profile so we don't leak orphans. fleet.remove()
    // handles all three in one call.
    try {
      // Subdomain-based proxy routes are no longer used. tenant-proxy resolves
      // upstreams directly from the Instance (Docker DNS via node_id) — see
      // tenant-proxy.ts "primary path".

      // 5. Register — profile (for listInstances) + bot_instances (for billing)
      const profile = {
        id: instanceId,
        tenantId,
        name,
        productSlug,
        description: description ?? "",
        image,
        env: instanceEnv,
        restartPolicy: "unless-stopped" as const,
        releaseChannel: "stable" as const,
        updatePolicy: "manual" as const,
      };
      await d.profileStore.save(profile);
      logger.info("Instance.create: profile saved", { instanceId });
      await d.botInstanceRepo.create({
        id: instanceId,
        tenantId,
        name,
        nodeId,
        containerPort,
        billingState: "inactive",
        createdByUserId: userId,
      });
      logger.info("Instance.create: bot instance registered", { instanceId, tenantId });

      // 6. Gateway key
      let gatewayKey: string | null = null;
      if (d.serviceKeyRepo) {
        try {
          gatewayKey = await d.serviceKeyRepo.generate(tenantId, instanceId, productSlug);
          logger.info("Instance.create: gateway key generated", { instanceId, hasKey: true });
        } catch (err) {
          logger.warn("Instance.create: gateway key generation failed", {
            instanceId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      } else {
        logger.info("Instance.create: no service key repo, skipping gateway key", { instanceId });
      }

      // 7. Provision — give the container its identity
      let provisioned = false;
      if (!productConfig.product?.domain) {
        throw new Error(`Product ${productSlug} has no domain configured`);
      }
      const gatewayUrl = `https://api.${productConfig.product.domain}/v1`;
      const containerUrl = result.url;
      logger.info("Instance.create: provisioning setup", {
        instanceId,
        containerName: result.containerName,
        containerUrl,
        gatewayUrl,
        hasSecret: !!d.provisionSecret,
        hasKey: !!gatewayKey,
      });

      if (d.provisionSecret && gatewayKey) {
        const provisionPayload = {
          tenantId,
          tenantName: name,
          gatewayUrl,
          apiKey: gatewayKey,
          budgetCents: balance.toCentsRounded(),
          adminUser: { id: userId, email: userEmail, name },
          agents: [{ name: (params.extra?.ceoName as string) || "CEO", role: "ceo", title: "Chief Executive Officer" }],
          extra: {
            instanceConfig: {
              deploymentMode: "hosted_proxy",
              hostedMode: true,
              deploymentExposure: "private",
            },
            ...params.extra,
          },
        };

        // Wait for sidecar to accept connections before provisioning.
        // Fail fast on permanent DNS errors (ENOTFOUND) — the container literally
        // does not exist by that name, no point retrying for 60 seconds.
        let sidecarReady = false;
        logger.info("Instance.create: waiting for sidecar health", { instanceId, containerUrl });
        for (let i = 0; i < 30; i++) {
          try {
            const res = await fetch(`${containerUrl}/health`, { signal: AbortSignal.timeout(2000) });
            if (res.ok) {
              sidecarReady = true;
              logger.info("Instance.create: sidecar healthy", { instanceId, waitedSeconds: i * 2 });
              break;
            }
            logger.info("Instance.create: sidecar responded but not ok", {
              instanceId,
              status: res.status,
              attempt: i + 1,
            });
          } catch (err) {
            // Permanent failure: DNS says the container doesn't exist. Bail
            // immediately so the saga rollback fires and the user gets a real
            // error instead of a 60-second wait followed by a fake success.
            const code = (err as { cause?: { code?: string } } | null)?.cause?.code;
            const msg = err instanceof Error ? err.message : String(err);
            if (code === "ENOTFOUND" || /ENOTFOUND|getaddrinfo/.test(msg)) {
              throw new Error(`Sidecar DNS lookup failed for ${containerUrl}: container does not exist`);
            }
            if (i % 5 === 0) {
              logger.info("Instance.create: sidecar not ready yet", {
                instanceId,
                attempt: i + 1,
                error: msg,
              });
            }
          }
          await new Promise((r) => setTimeout(r, 2000));
        }
        if (!sidecarReady) {
          throw new Error(`Sidecar not ready after 60s: ${containerUrl}`);
        }

        const { provisionContainer } = await import("@wopr-network/provision-client");
        logger.info("Instance.create: sending provision request", {
          instanceId,
          containerUrl,
          tenantId,
          budgetCents: provisionPayload.budgetCents,
        });
        // Provisioning failure is fatal — the instance is useless without it.
        // The outer try/catch (added below) rolls back the partial state.
        await provisionContainer(containerUrl, d.provisionSecret, provisionPayload);
        provisioned = true;
        logger.info("Instance.create: provisioned successfully", { instanceId, containerUrl });
      } else {
        logger.warn("Instance.create: skipping provision — missing secret or gateway key", {
          instanceId,
          hasSecret: !!d.provisionSecret,
          hasKey: !!gatewayKey,
        });
      }

      // 8. Start billing — provisioned is always true here (failure throws above)
      try {
        await d.botInstanceRepo.setBillingState(instanceId, "active");
        logger.info("Instance: billing started", { instanceId });
      } catch (err) {
        // Billing failure is non-fatal for the create call: the instance is
        // alive and provisioned, the operator can fix billing afterwards.
        logger.warn("Instance: startBilling failed", {
          instanceId,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      return { id: instanceId, name, tenantId, nodeId, containerUrl, gatewayKey, provisioned };
    } catch (err) {
      logger.error("Instance.create: post-create step failed, rolling back", {
        instanceId,
        error: err instanceof Error ? err.message : String(err),
      });
      try {
        await d.fleet.remove(instanceId);
        logger.info("Instance.create: rollback removed container + profile + bot_instance", { instanceId });
      } catch (cleanupErr) {
        logger.warn("Instance.create: rollback fleet.remove failed (orphan reconciliation will sweep)", {
          instanceId,
          err: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
        });
      }
      throw err;
    }
  }

  /**
   * Create a bare container — no billing, no provisioning, no credit check.
   *
   * Products that manage their own lifecycle (e.g., holyship workers) call this
   * instead of create(). They get a container on a node and handle setup themselves.
   */
  async createContainer(params: {
    tenantId: string;
    name: string;
    image: string;
    productSlug: string;
    env?: Record<string, string>;
    network?: string;
    restartPolicy?: "no" | "always" | "on-failure" | "unless-stopped";
    readonlyRootfs?: boolean;
  }): Promise<{ id: string; url: string; containerId: string; name: string; gatewayKey: string | null }> {
    // Bare container — products like holyship manage their own lifecycle.
    // Goes through the Fleet composite so placement picks a node like any
    // other create. No more nodes[0] hardcode.
    const instance = await this.deps.fleet.create({
      tenantId: params.tenantId,
      name: params.name,
      description: "",
      image: params.image,
      productSlug: params.productSlug,
      env: params.env ?? {},
      restartPolicy: params.restartPolicy ?? "no",
      releaseChannel: "stable",
      updatePolicy: "manual",
      readonlyRootfs: params.readonlyRootfs,
      network: params.network,
    });
    // Start the container — fleet.create() only creates, doesn't start
    await instance.start();

    // Generate per-instance gateway service key for metered billing
    let gatewayKey: string | null = null;
    const d = this.deps;
    if (d.serviceKeyRepo) {
      try {
        gatewayKey = await d.serviceKeyRepo.generate(params.tenantId, instance.id, params.productSlug);
      } catch (err) {
        logger.warn("createContainer: gateway key generation failed", {
          instanceId: instance.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {
      id: instance.id,
      url: instance.url,
      containerId: instance.containerId,
      name: instance.profile.name,
      gatewayKey,
    };
  }

  /**
   * Destroy a managed instance — deprovision, revoke keys, remove container,
   * stop billing. Owner-node lookup is handled inside fleet.getInstance/remove.
   */
  async destroy(params: { instanceId: string; provisionSecret: string; tenantEntityId?: string }): Promise<void> {
    const { instanceId, provisionSecret, tenantEntityId } = params;
    const d = this.deps;

    logger.info("Instance.destroy: starting", { instanceId, hasTenantEntity: !!tenantEntityId });

    // 1. Deprovision (graceful teardown inside the container)
    if (tenantEntityId) {
      try {
        const inst = await d.fleet.getInstance(instanceId);
        const { deprovisionContainer } = await import("@wopr-network/provision-client");
        await deprovisionContainer(inst.url, provisionSecret, tenantEntityId);
        logger.info("Instance.destroy: deprovisioned", { instanceId });
      } catch (err) {
        logger.warn("Instance.destroy: deprovision failed (continuing)", {
          instanceId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 2. Revoke gateway service key
    if (d.serviceKeyRepo) {
      await d.serviceKeyRepo.revokeByInstance(instanceId);
      logger.info("Instance.destroy: service key revoked", { instanceId });
    }

    // 3. Remove the Docker container (composite resolves owner node, deletes profile + bot_instances)
    try {
      await d.fleet.remove(instanceId);
      logger.info("Instance.destroy: container removed", { instanceId });
    } catch (err) {
      logger.warn("Instance.destroy: container removal failed (may already be gone)", {
        instanceId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // 4. Stop billing
    try {
      await d.botInstanceRepo.setBillingState(instanceId, "inactive");
      logger.info("Instance.destroy: billing stopped", { instanceId });
    } catch (err) {
      logger.warn("Instance.destroy: stop billing failed", {
        instanceId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Update the spending budget on a running instance.
   */
  async updateBudget(params: {
    instanceId: string;
    provisionSecret: string;
    tenantEntityId: string;
    budgetCents: number;
    perAgentCents?: number;
  }): Promise<void> {
    const { instanceId, provisionSecret, tenantEntityId, budgetCents, perAgentCents } = params;
    const inst = await this.deps.fleet.getInstance(instanceId);
    logger.info("Instance.updateBudget: forwarding", { instanceId, budgetCents, url: inst.url });

    const { updateBudget: sendBudgetUpdate } = await import("@wopr-network/provision-client");
    await sendBudgetUpdate(inst.url, provisionSecret, tenantEntityId, budgetCents, perAgentCents);

    logger.info("Instance.updateBudget: done", { instanceId, budgetCents });
  }
}
