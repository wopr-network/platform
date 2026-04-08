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
import type { IOperationQueue } from "../queue/operation-queue.js";
import type { IBotInstanceRepository } from "./bot-instance-repository.js";
import type { IFleet } from "./i-fleet.js";

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
  botInstanceRepo: IBotInstanceRepository;
  serviceKeyRepo: IServiceKeyRepository | null;
  provisionSecret: string | null;
  /**
   * The Fleet composite. Hides node placement, pool claim, and per-node
   * dispatch behind one IFleet interface — InstanceService never iterates
   * nodes or knows which one will be picked.
   */
  fleet: IFleet;
  /**
   * Optional DB-as-channel queue. When wired, `create()` enqueues an
   * `instance.create` row instead of running the saga directly — the row is
   * claimed by whichever core replica's worker reaches it first, the saga
   * runs there, and the public Promise resolves with the result.
   *
   * When `null`/undefined the service runs the saga inline (test mode and
   * any boot path that hasn't migrated yet). The public contract is identical
   * either way: `await instanceService.create(params)` returns a CreatedInstance
   * or throws.
   */
  operationQueue?: IOperationQueue | null;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Operation types registered with the core QueueWorker. Handlers are wired
 * in container.ts after both InstanceService and the worker are constructed.
 */
export const INSTANCE_CREATE_OP = "instance.create" as const;
export const INSTANCE_DESTROY_OP = "instance.destroy" as const;
export const INSTANCE_UPDATE_BUDGET_OP = "instance.update_budget" as const;
export const INSTANCE_CREATE_CONTAINER_OP = "instance.create_container" as const;

/** Params accepted by createContainer. Serializable for queue transport. */
export interface CreateContainerParams {
  tenantId: string;
  name: string;
  image: string;
  productSlug: string;
  env?: Record<string, string>;
  network?: string;
  restartPolicy?: "no" | "always" | "on-failure" | "unless-stopped";
  readonlyRootfs?: boolean;
}

/** Result from createContainer — also serializable. */
export interface CreatedBareContainer {
  id: string;
  url: string;
  containerId: string;
  name: string;
  gatewayKey: string | null;
}

export class InstanceService {
  constructor(private readonly deps: InstanceServiceDeps) {}

  /**
   * Public create entry point. The shape of the Promise is unchanged from
   * pre-queue days — callers `await instanceService.create(params)` and get
   * back a CreatedInstance or an Error. The fact that there may be a DB
   * round-trip and a worker dispatch in between is invisible to the caller,
   * which is the entire point of the DB-as-channel architecture.
   *
   * When `deps.operationQueue` is wired, the call enqueues an `instance.create`
   * row and parks on its terminal state. When it isn't wired (tests, legacy
   * boot paths), the saga runs inline. Both paths converge on the same
   * `runCreate()` body — the queue is a transport, not a behavior change.
   */
  async create(params: CreateInstanceParams): Promise<CreatedInstance> {
    if (this.deps.operationQueue) {
      // ProductConfig is plain data (verified at refactor time — interfaces
      // only, no methods), so it round-trips through JSON cleanly. We pass
      // the whole CreateInstanceParams through and let the handler reconstruct
      // it on the other side.
      return await this.deps.operationQueue.execute<CreatedInstance>({
        type: INSTANCE_CREATE_OP,
        target: "core",
        payload: params as never,
      });
    }
    return await this.runCreate(params);
  }

  /**
   * Queue handler entry point — invoked by the core QueueWorker when it claims
   * an `instance.create` row. The payload was JSON round-tripped through the
   * `pending_operations.payload` jsonb column so we cast it back to params.
   */
  async handleCreateOperation(payload: unknown): Promise<CreatedInstance> {
    return await this.runCreate(payload as CreateInstanceParams);
  }

  /**
   * The actual create saga. Same body as the pre-queue create() — credit
   * check, fleet acquisition, bot_instances row, gateway key, provision,
   * billing — with the same rollback. Called either inline (test mode /
   * legacy) or by the queue handler.
   */
  private async runCreate(params: CreateInstanceParams): Promise<CreatedInstance> {
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
      const tenantInstances = await d.botInstanceRepo.listByTenant(tenantId);
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

      // 5. Write the bot_instances row — the single source of truth for
      // "tenant X has instance Y". Post-collapse, there's no separate
      // profile store — InstanceService is the only writer.
      await d.botInstanceRepo.create({
        id: instanceId,
        tenantId,
        productSlug,
        name,
        nodeId,
        containerPort,
        billingState: "inactive",
        createdByUserId: userId,
      });
      logger.info("Instance.create: bot instance registered", { instanceId, tenantId });

      // 6. Gateway key — fatal: an instance that's billed but can't authenticate
      // its inference traffic against the gateway is a half-broken instance.
      // The saga rollback below tears it down so the user can retry.
      let gatewayKey: string | null = null;
      if (d.serviceKeyRepo) {
        gatewayKey = await d.serviceKeyRepo.generate(tenantId, instanceId, productSlug);
        logger.info("Instance.create: gateway key generated", { instanceId, hasKey: true });
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

      // 8. Start billing — fatal: an instance that exists but isn't billable
      // is a silent revenue leak. The saga rollback below catches this and
      // tears the instance down so the user can retry.
      await d.botInstanceRepo.setBillingState(instanceId, "active");
      logger.info("Instance: billing started", { instanceId });

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
   * Products that manage their own lifecycle (e.g., holyship workers) call
   * this instead of create(). They get a container on a node and handle
   * setup themselves.
   *
   * Dispatches through the queue when `operationQueue` is wired, same as
   * create() / destroy() / updateBudget(). Public Promise shape is
   * unchanged.
   */
  async createContainer(params: CreateContainerParams): Promise<CreatedBareContainer> {
    if (this.deps.operationQueue) {
      return await this.deps.operationQueue.execute<CreatedBareContainer>({
        type: INSTANCE_CREATE_CONTAINER_OP,
        target: "core",
        payload: params as never,
      });
    }
    return await this.runCreateContainer(params);
  }

  /** Queue handler entry point for `instance.create_container`. */
  async handleCreateContainerOperation(payload: unknown): Promise<CreatedBareContainer> {
    return await this.runCreateContainer(payload as CreateContainerParams);
  }

  private async runCreateContainer(params: CreateContainerParams): Promise<CreatedBareContainer> {
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
   *
   * Dispatches through the queue when `operationQueue` is wired. Same
   * contract as `create`: Promise<void> resolves on success, rejects on
   * any failure, transport is invisible to callers.
   */
  async destroy(params: { instanceId: string; provisionSecret: string; tenantEntityId?: string }): Promise<void> {
    if (this.deps.operationQueue) {
      await this.deps.operationQueue.execute<void>({
        type: INSTANCE_DESTROY_OP,
        target: "core",
        payload: params as never,
      });
      return;
    }
    return await this.runDestroy(params);
  }

  /** Queue handler entry point for `instance.destroy`. */
  async handleDestroyOperation(payload: unknown): Promise<void> {
    await this.runDestroy(payload as { instanceId: string; provisionSecret: string; tenantEntityId?: string });
  }

  private async runDestroy(params: {
    instanceId: string;
    provisionSecret: string;
    tenantEntityId?: string;
  }): Promise<void> {
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
   * Update the spending budget on a running instance. Dispatches through
   * the queue when `operationQueue` is wired. Public Promise<void> contract
   * is identical regardless of transport.
   */
  async updateBudget(params: {
    instanceId: string;
    provisionSecret: string;
    tenantEntityId: string;
    budgetCents: number;
    perAgentCents?: number;
  }): Promise<void> {
    if (this.deps.operationQueue) {
      await this.deps.operationQueue.execute<void>({
        type: INSTANCE_UPDATE_BUDGET_OP,
        target: "core",
        payload: params as never,
      });
      return;
    }
    return await this.runUpdateBudget(params);
  }

  /** Queue handler entry point for `instance.update_budget`. */
  async handleUpdateBudgetOperation(payload: unknown): Promise<void> {
    await this.runUpdateBudget(
      payload as {
        instanceId: string;
        provisionSecret: string;
        tenantEntityId: string;
        budgetCents: number;
        perAgentCents?: number;
      },
    );
  }

  private async runUpdateBudget(params: {
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
