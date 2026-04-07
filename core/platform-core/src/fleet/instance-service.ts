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
import type { ContainerPlacementStrategy } from "./container-placement.js";
import type { FleetResolver } from "./fleet-resolver.js";
import type { NodeRegistry } from "./node-registry.js";
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
  /** Node-aware fleet infrastructure — placement, tracking, proxy registration. */
  nodeRegistry: NodeRegistry;
  placementStrategy: ContainerPlacementStrategy;
  fleetResolver: FleetResolver;
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

    // 3. Acquire container via fleet (pool is handled inside FleetManager.create)
    const instanceEnv: Record<string, string> = { ...env };
    if (d.provisionSecret) {
      instanceEnv.WOPR_PROVISION_SECRET = d.provisionSecret;
    }

    // 4. Select target node via placement strategy
    const nodes = d.nodeRegistry.list();
    const containerCounts = await d.nodeRegistry.getContainerCounts();
    const targetNode = d.placementStrategy.selectNode(nodes, containerCounts);
    const fleet = targetNode.fleet;
    logger.info("Instance.create: node selected", {
      nodeId: targetNode.config.id,
      nodeName: targetNode.config.name,
      productSlug,
      image,
    });

    // 3. Create container on the selected node
    const result = await fleet.create({
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
    logger.info("Instance.create: container created", { instanceId, productSlug, nodeId: targetNode.config.id });

    // 4. Register proxy route (node assignment persisted in bot_instances below)
    const upstreamHost = d.nodeRegistry.resolveUpstreamHost(targetNode.config.id, result.containerName);
    await d.fleetResolver.registerRoute(instanceId, name, upstreamHost, containerPort);
    logger.info("Instance.create: proxy registered", { instanceId, upstreamHost, nodeId: targetNode.config.id });

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
      nodeId: targetNode.config.id,
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

      // Wait for sidecar to accept connections before provisioning
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
          if (i % 5 === 0) {
            logger.info("Instance.create: sidecar not ready yet", {
              instanceId,
              attempt: i + 1,
              error: err instanceof Error ? err.message : "fetch failed",
            });
          }
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (!sidecarReady) {
        logger.warn("Instance.create: sidecar not ready after 60s, provisioning anyway", { instanceId, containerUrl });
      }

      const { provisionContainer } = await import("@wopr-network/provision-client");
      logger.info("Instance.create: sending provision request", {
        instanceId,
        containerUrl,
        tenantId,
        budgetCents: provisionPayload.budgetCents,
      });
      try {
        await provisionContainer(containerUrl, d.provisionSecret, provisionPayload);
        provisioned = true;
        logger.info("Instance.create: provisioned successfully", { instanceId, containerUrl });
      } catch (err) {
        logger.error("Instance.create: provisioning FAILED", {
          instanceId,
          containerUrl,
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        });
      }
    } else {
      logger.warn("Instance.create: skipping provision — missing secret or gateway key", {
        instanceId,
        hasSecret: !!d.provisionSecret,
        hasKey: !!gatewayKey,
      });
    }

    // 8. Start billing — activate the daily charge clock
    try {
      await d.botInstanceRepo.setBillingState(instanceId, "active");
      logger.info("Instance: billing started", { instanceId });
    } catch (err) {
      logger.warn("Instance: startBilling failed", {
        instanceId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return { id: instanceId, name, tenantId, nodeId: targetNode.config.id, containerUrl, gatewayKey, provisioned };
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
    // Bare container — use local node's fleet manager directly (no node placement).
    // Products like holyship manage their own lifecycle.
    const localNode = this.deps.nodeRegistry.list()[0];
    const fleet = localNode.fleet;
    const instance = await fleet.create({
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
   * Resolve the fleet manager for an existing instance.
   * Reads node_id from bot_instances DB — survives restarts.
   */
  private async resolveFleetForInstance(instanceId: string) {
    const d = this.deps;
    const botInstance = await d.botInstanceRepo.getById(instanceId);
    const nodeId = botInstance?.nodeId ?? null;
    const fleet = nodeId ? d.nodeRegistry.getFleetManager(nodeId) : d.nodeRegistry.list()[0].fleet;
    return { fleet, nodeId };
  }

  /**
   * Destroy a managed instance — deprovision, revoke keys, remove container,
   * unassign node, remove proxy route, stop billing.
   */
  async destroy(params: { instanceId: string; provisionSecret: string; tenantEntityId?: string }): Promise<void> {
    const { instanceId, provisionSecret, tenantEntityId } = params;
    const d = this.deps;
    const { fleet } = await this.resolveFleetForInstance(instanceId);

    logger.info("Instance.destroy: starting", { instanceId, hasTenantEntity: !!tenantEntityId });

    // 1. Deprovision (graceful teardown inside the container)
    if (tenantEntityId) {
      try {
        const inst = await fleet.getInstance(instanceId);
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

    // 3. Remove the Docker container
    try {
      await fleet.remove(instanceId);
      logger.info("Instance.destroy: container removed", { instanceId });
    } catch (err) {
      logger.warn("Instance.destroy: container removal failed (may already be gone)", {
        instanceId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // 4. Remove proxy route (node assignment cleaned up when bot_instances row is deleted)
    await d.fleetResolver.removeRoute(instanceId);
    logger.info("Instance.destroy: route removed", { instanceId });

    // 5. Stop billing
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
    const { fleet } = await this.resolveFleetForInstance(instanceId);

    const inst = await fleet.getInstance(instanceId);
    logger.info("Instance.updateBudget: forwarding", { instanceId, budgetCents, url: inst.url });

    const { updateBudget: sendBudgetUpdate } = await import("@wopr-network/provision-client");
    await sendBudgetUpdate(inst.url, provisionSecret, tenantEntityId, budgetCents, perAgentCents);

    logger.info("Instance.updateBudget: done", { instanceId, budgetCents });
  }
}
