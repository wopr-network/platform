import { createHash, randomUUID } from "node:crypto";
import { Hono } from "hono";
import { z } from "zod";
import type { NodeRegistration } from "../../fleet/repository-types.js";

const RegisterNodeSchema = z.object({
  node_id: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z0-9_-]+$/),
  host: z
    .string()
    .min(1)
    .max(253)
    .regex(/^[a-zA-Z0-9._-]+$/),
  capacity_mb: z.number().int().positive().max(1_048_576),
  agent_version: z.string().min(1).max(32),
});

// ── Minimal interfaces for injectable deps ──

export interface INodeRegistrar {
  register(registration: NodeRegistration): Promise<unknown>;
  registerSelfHosted(
    registration: NodeRegistration & {
      ownerUserId: string;
      label: string | null;
      nodeSecretHash: string;
    },
  ): Promise<unknown>;
}

export interface INodeRepoForRegistration {
  getBySecret(secret: string): Promise<{ id: string } | null>;
}

export interface IRegistrationTokenStore {
  consume(token: string, nodeId: string): Promise<{ userId: string; label: string | null } | null>;
}

export type HostValidator = (host: string) => void;

export interface InternalNodeDeps {
  nodeRegistrar: () => INodeRegistrar;
  nodeRepo: () => INodeRepoForRegistration;
  registrationTokenStore: () => IRegistrationTokenStore;
  validateNodeHost: HostValidator;
  logger?: { info(msg: string): void };
  /** Prefix for self-hosted node IDs. Default: "self" */
  nodeIdPrefix?: string;
  /** Prefix for node secrets. Default: "wopr_node_" */
  nodeSecretPrefix?: string;
}

/**
 * Create internal node registration routes.
 *
 * These are machine-to-machine routes used by node agents, not dashboard UI.
 */
export function createInternalNodeRoutes(deps: InternalNodeDeps): Hono {
  const routes = new Hono();

  /**
   * POST /register
   * Node registration (called on agent boot).
   *
   * Supports 2 auth paths:
   * 1. Per-node persistent secret (returning self-hosted agent)
   * 2. One-time registration token (new self-hosted node, UUID format)
   */
  routes.post("/register", async (c) => {
    const authHeader = c.req.header("Authorization");
    const bearer = authHeader?.replace(/^Bearer\s+/i, "");

    if (!bearer) {
      return c.json({ success: false, error: "Unauthorized" }, 401);
    }

    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return c.json({ success: false, error: "Invalid registration data" }, 400);
    }

    const parsed = RegisterNodeSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json({ success: false, error: "Invalid registration data", details: parsed.error.flatten() }, 400);
    }

    const body = parsed.data;

    try {
      deps.validateNodeHost(body.host);
    } catch (err) {
      return c.json({ success: false, error: (err as Error).message }, 400);
    }

    const registrar = deps.nodeRegistrar();
    const nodeRepo = deps.nodeRepo();

    // Map snake_case HTTP body to camelCase domain type
    const registration: NodeRegistration = {
      nodeId: body.node_id,
      host: body.host,
      capacityMb: body.capacity_mb,
      agentVersion: body.agent_version,
    };

    // Path 1: Per-node persistent secret (returning agent)
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(bearer)) {
      const existingNode = await nodeRepo.getBySecret(bearer);
      if (existingNode) {
        await registrar.register({ ...registration, nodeId: existingNode.id });
        deps.logger?.info(`Node re-registered via per-node secret: ${existingNode.id}`);
        return c.json({ success: true });
      }
      return c.json({ success: false, error: "Unauthorized" }, 401);
    }

    // Path 2: One-time registration token (UUID format = registration token)
    const tokenStore = deps.registrationTokenStore();
    const prefix = deps.nodeIdPrefix ?? "self";
    const nodeId = `${prefix}-${randomUUID().slice(0, 8)}`;
    const consumed = await tokenStore.consume(bearer, nodeId);

    if (!consumed) {
      return c.json({ success: false, error: "Invalid or expired token" }, 401);
    }

    // Generate persistent per-node secret
    const secretPrefix = deps.nodeSecretPrefix ?? "wopr_node_";
    const nodeSecret = `${secretPrefix}${randomUUID().replace(/-/g, "")}`;
    const hashedSecret = createHash("sha256").update(nodeSecret).digest("hex");

    // Register self-hosted node via registrar
    await registrar.registerSelfHosted({
      ...registration,
      nodeId,
      ownerUserId: consumed.userId,
      label: consumed.label,
      nodeSecretHash: hashedSecret,
    });

    deps.logger?.info(`Self-hosted node registered: ${nodeId} for user ${consumed.userId}`);

    return c.json({
      success: true,
      node_id: nodeId,
      node_secret: nodeSecret, // Agent saves this — only returned once
    });
  });

  return routes;
}
