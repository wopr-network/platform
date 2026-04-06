/**
 * InstanceService — orchestrates the full instance lifecycle.
 *
 * Single entry point for creating, provisioning, and billing instances.
 * Fleet handles container acquisition (including pool). This service
 * handles credit checks, provisioning, and billing on top.
 */

import { logger } from "../config/logger.js";
import { Credit } from "../credits/index.js";
import type { ILedger } from "../credits/ledger.js";
import type { IServiceKeyRepository } from "../gateway/service-key-repository.js";
import type { ProductConfig } from "../product-config/index.js";
import type { IBotInstanceRepository } from "./bot-instance-repository.js";
import type { IProfileStore } from "./profile-store.js";
import { containerNameFor } from "./types.js";

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
  gatewayKey: string | null;
  provisioned: boolean;
}

export interface InstanceServiceDeps {
  creditLedger: ILedger;
  profileStore: IProfileStore;
  botInstanceRepo: IBotInstanceRepository;
  serviceKeyRepo: IServiceKeyRepository | null;
  provisionSecret: string | null;
  /** Fleet manager — handles container creation (pool is internal to fleet) */
  getFleetManager: () => {
    create: (params: Record<string, unknown>) => Promise<{
      id: string;
      url: string;
      containerId: string;
      profile: { name: string; tenantId: string };
      start(): Promise<void>;
    }>;
  };
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

    // 1. Credit check
    const balance = await d.creditLedger.balance(tenantId);
    if (balance.lessThan(Credit.fromCents(17))) {
      throw new Error(`Insufficient credits: ${balance.toCentsRounded()}¢ (need 17¢ minimum)`);
    }

    // 2. Acquire container via fleet (pool is handled inside FleetManager.create)
    const instanceEnv: Record<string, string> = { ...env };
    if (d.provisionSecret) {
      instanceEnv.WOPR_PROVISION_SECRET = d.provisionSecret;
    }

    const fleet = d.getFleetManager();
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
    logger.info("Instance: created", { instanceId, productSlug });

    // 3. Register — profile (for listInstances) + bot_instances (for billing)
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
    await d.botInstanceRepo.create({
      id: instanceId,
      tenantId,
      name,
      nodeId: null,
      createdByUserId: userId,
    });

    // 4. Gateway key
    let gatewayKey: string | null = null;
    if (d.serviceKeyRepo) {
      try {
        gatewayKey = await d.serviceKeyRepo.generate(tenantId, instanceId, productSlug);
      } catch (err) {
        logger.warn("Instance: gateway key generation failed", {
          instanceId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 5. Provision — give the container its identity
    let provisioned = false;
    if (!productConfig.product?.domain) {
      throw new Error(`Product ${productSlug} has no domain configured`);
    }
    const gatewayUrl = `https://api.${productConfig.product.domain}/v1`;
    if (d.provisionSecret && gatewayKey) {
      const containerUrl = `http://${containerNameFor(profile)}:${containerPort}`;
      try {
        const { provisionContainer } = await import("@wopr-network/provision-client");
        await provisionContainer(containerUrl, d.provisionSecret, {
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
        });
        provisioned = true;
        logger.info("Instance: provisioned", { instanceId, containerUrl });
      } catch (err) {
        logger.warn("Instance: provisioning failed (non-fatal)", {
          instanceId,
          containerUrl,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 6. Start billing — activate the daily charge clock
    try {
      await d.botInstanceRepo.setBillingState(instanceId, "active");
      logger.info("Instance: billing started", { instanceId });
    } catch (err) {
      logger.warn("Instance: startBilling failed", {
        instanceId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return { id: instanceId, name, tenantId, gatewayKey, provisioned };
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
    const fleet = this.deps.getFleetManager();
    const instance = await fleet.create({
      tenantId: params.tenantId,
      name: params.name,
      image: params.image,
      productSlug: params.productSlug,
      env: params.env ?? {},
      restartPolicy: params.restartPolicy ?? "no",
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
}
