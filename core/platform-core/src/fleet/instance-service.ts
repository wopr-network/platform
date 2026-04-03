/**
 * InstanceService — orchestrates the full instance lifecycle.
 *
 * Single entry point for creating, provisioning, and billing instances.
 * Abstracts pool-vs-cold container acquisition. The tRPC handler calls
 * this service; it never touches Docker, profiles, or billing directly.
 */

import { logger } from "../config/logger.js";
import { Credit } from "../credits/index.js";
import type { ILedger } from "../credits/ledger.js";
import type { IServiceKeyRepository } from "../gateway/service-key-repository.js";
import type { ProductConfig } from "../product-config/index.js";
import type { IPoolRepository } from "../server/services/pool-repository.js";
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
  poolRepo: IPoolRepository | null;
  docker: import("dockerode") | null;
  provisionSecret: string | null;
  /** Resolve fleet manager for cold-create fallback */
  getFleetManager: () => {
    create: (params: Record<string, unknown>) => Promise<{ id: string; profile: { name: string; tenantId: string } }>;
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
    const isEphemeral = fleetConfig?.lifecycle === "ephemeral";

    // 1. Credit check — ephemeral instances skip (they bill per-token at the gateway)
    const balance = await d.creditLedger.balance(tenantId);
    if (!isEphemeral && balance.lessThan(Credit.fromCents(17))) {
      throw new Error(`Insufficient credits: ${balance.toCentsRounded()}¢ (need 17¢ minimum)`);
    }

    // 2. Acquire container — pool first, cold create fallback
    let instanceId: string;
    const claimed = d.poolRepo ? await d.poolRepo.claimWarm(tenantId, name, productSlug) : null;

    // Inject provision secret so the sidecar can validate provisioning calls
    const instanceEnv: Record<string, string> = { ...env };
    if (d.provisionSecret) {
      instanceEnv.WOPR_PROVISION_SECRET = d.provisionSecret;
    }

    if (claimed && d.docker) {
      instanceId = claimed.id;
      const cname = containerNameFor({ name, productSlug });
      try {
        const container = d.docker.getContainer(claimed.containerId);
        await container.rename({ name: cname });
        logger.info("Instance: pool claim + rename", { instanceId, containerName: cname, productSlug });
      } catch (renameErr) {
        throw new Error(
          `Container rename failed: ${renameErr instanceof Error ? renameErr.message : String(renameErr)}`,
        );
      }
    } else {
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
      instanceId = result.id;
      logger.info("Instance: cold create", { instanceId, productSlug });
    }

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
          agents: [{ name: "CEO", role: "ceo", title: "Chief Executive Officer" }],
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
    if (!isEphemeral) {
      try {
        await d.botInstanceRepo.setBillingState(instanceId, "active");
        logger.info("Instance: billing started", { instanceId });
      } catch (err) {
        logger.warn("Instance: startBilling failed", {
          instanceId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { id: instanceId, name, tenantId, gatewayKey, provisioned };
  }
}
