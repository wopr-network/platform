import { Hono } from "hono";
import { z } from "zod";
import type { AuthEnv } from "../../auth/index.js";
import type { RecoveryEvent } from "../../fleet/repository-types.js";
import type { AdminAuditLogger } from "./admin-audit-helper.js";
import { safeAuditLog } from "./admin-audit-helper.js";

// ── Minimal interfaces for injectable deps ──

export interface IRecoveryRepository {
  listEvents(limit: number, status?: RecoveryEvent["status"]): Promise<RecoveryEvent[]>;
}

export interface IRecoveryOrchestrator {
  getEventDetails(eventId: string): Promise<{ event: RecoveryEvent | undefined; items: unknown[] }>;
  retryWaiting(eventId: string): Promise<unknown>;
  triggerRecovery(nodeId: string, trigger: string): Promise<unknown>;
}

export interface INodeRepository {
  list(): Promise<unknown[]>;
  getById(nodeId: string): Promise<unknown | null>;
  transition(nodeId: string, targetStatus: string, reason: string, actor: string): Promise<unknown>;
}

export interface INodeProvisioner {
  provision(opts: { region?: string; size?: string; name?: string }): Promise<{
    nodeId: string;
    externalId?: string;
    region?: string;
    size?: string;
    monthlyCostCents?: number;
  }>;
  destroy(nodeId: string): Promise<void>;
  listRegions(): Promise<unknown[]>;
  listSizes(): Promise<unknown[]>;
}

export interface INodeDrainer {
  drain(nodeId: string): Promise<{ migrated: unknown[]; failed: unknown[] }>;
}

export interface IBotInstanceRepository {
  listByNode(nodeId: string): Promise<unknown[]>;
  getById(botId: string): Promise<{ nodeId?: string | null; tenantId?: string | null } | null>;
}

export interface ICommandBus {
  send(nodeId: string, command: { type: string; payload: Record<string, unknown> }): Promise<{ data?: unknown }>;
}

export interface IMigrationOrchestrator {
  migrate(
    botId: string,
    targetNodeId?: string,
  ): Promise<{
    success: boolean;
    error?: string;
    sourceNodeId?: string;
    targetNodeId?: string;
    downtimeMs?: number;
  }>;
}

export type CapacityAlertChecker = (nodes: unknown[]) => unknown[];

// ── Recovery routes ──

export interface AdminRecoveryDeps {
  recoveryRepo: () => IRecoveryRepository;
  recoveryOrchestrator: () => IRecoveryOrchestrator;
  auditLogger?: () => AdminAuditLogger;
  logger?: { error(msg: string, meta?: Record<string, unknown>): void };
}

export function createAdminRecoveryRoutes(deps: AdminRecoveryDeps): Hono<AuthEnv> {
  const routes = new Hono<AuthEnv>();

  routes.get("/", async (c) => {
    const rawLimit = Number.parseInt(c.req.query("limit") ?? "50", 10);
    const limit = Number.isNaN(rawLimit) || rawLimit < 1 ? 50 : Math.min(rawLimit, 500);

    const rawStatus = c.req.query("status");
    const validStatuses: RecoveryEvent["status"][] = ["in_progress", "partial", "completed"];
    const statusFilter =
      rawStatus && (validStatuses as string[]).includes(rawStatus) ? (rawStatus as RecoveryEvent["status"]) : undefined;
    const events = await deps.recoveryRepo().listEvents(limit, statusFilter);

    return c.json({ success: true, events, count: events.length });
  });

  routes.get("/:eventId", async (c) => {
    const eventId = c.req.param("eventId") as string;
    const { event, items } = await deps.recoveryOrchestrator().getEventDetails(eventId);

    if (!event) {
      return c.json({ success: false, error: "Recovery event not found" }, 404);
    }

    return c.json({ success: true, event, items });
  });

  routes.post("/:eventId/retry", async (c) => {
    const eventId = c.req.param("eventId") as string;

    try {
      const report = await deps.recoveryOrchestrator().retryWaiting(eventId);
      return c.json({ success: true, report });
    } catch (err) {
      deps.logger?.error("Failed to retry waiting tenants", { eventId, err });
      return c.json({ success: false, error: err instanceof Error ? err.message : "Unknown error" }, 500);
    }
  });

  return routes;
}

// ── Node management routes ──

export interface AdminNodeDeps {
  nodeRepo: () => INodeRepository;
  nodeProvisioner: () => INodeProvisioner;
  nodeDrainer: () => INodeDrainer;
  botInstanceRepo: () => IBotInstanceRepository;
  recoveryOrchestrator: () => IRecoveryOrchestrator;
  migrationOrchestrator: () => IMigrationOrchestrator;
  commandBus: () => ICommandBus;
  capacityAlertChecker: CapacityAlertChecker;
  auditLogger?: () => AdminAuditLogger;
  logger?: { error(msg: string, meta?: Record<string, unknown>): void };
}

export function createAdminNodeRoutes(deps: AdminNodeDeps): Hono<AuthEnv> {
  const routes = new Hono<AuthEnv>();

  routes.get("/", async (c) => {
    const nodes = await deps.nodeRepo().list();
    const alerts = deps.capacityAlertChecker(nodes);
    return c.json({ success: true, nodes, count: nodes.length, alerts });
  });

  routes.post("/", async (c) => {
    try {
      const body = await c.req.json();
      const parsed = z
        .object({
          region: z.string().min(1).max(20).optional(),
          size: z.string().min(1).max(50).optional(),
          name: z
            .string()
            .min(1)
            .max(63)
            .regex(/^[a-zA-Z0-9][a-zA-Z0-9-]*$/)
            .optional(),
        })
        .parse(body);

      const result = await deps.nodeProvisioner().provision(parsed);

      safeAuditLog(deps.auditLogger, {
        adminUser: (c.get("user") as { id?: string } | undefined)?.id ?? "unknown",
        action: "node.provision",
        category: "config",
        details: {
          nodeId: result.nodeId,
          externalId: result.externalId,
          region: result.region,
          size: result.size,
          monthlyCostCents: result.monthlyCostCents,
        },
      });

      return c.json({ success: true, node: result }, 201);
    } catch (err) {
      if (err instanceof Error && err.message.includes("DO_API_TOKEN")) {
        return c.json(
          { success: false, error: "Node provisioning not configured. Set DO_API_TOKEN environment variable." },
          503,
        );
      }
      deps.logger?.error("Node provisioning failed", { err });
      return c.json({ success: false, error: err instanceof Error ? err.message : "Unknown error" }, 500);
    }
  });

  routes.post("/migrate", async (c) => {
    try {
      const body = await c.req.json();
      const parsed = z
        .object({
          botId: z.string().min(1),
          targetNodeId: z.string().min(1),
        })
        .parse(body);

      const bot = await deps.botInstanceRepo().getById(parsed.botId);
      if (!bot) {
        return c.json({ success: false, error: "Bot not found" }, 404);
      }
      if (!bot.nodeId) {
        return c.json({ success: false, error: "Bot has no node assignment" }, 400);
      }
      if (bot.nodeId === parsed.targetNodeId) {
        return c.json({ success: false, error: "Source and target nodes are the same" }, 400);
      }

      const result = await deps.migrationOrchestrator().migrate(parsed.botId, parsed.targetNodeId);

      if (!result.success) {
        return c.json({ success: false, error: result.error }, 500);
      }

      safeAuditLog(deps.auditLogger, {
        adminUser: (c.get("user") as { id?: string } | undefined)?.id ?? "unknown",
        action: "node.migrate",
        category: "config",
        details: {
          botId: parsed.botId,
          tenantId: bot.tenantId,
          sourceNode: result.sourceNodeId,
          targetNode: result.targetNodeId,
          downtimeMs: result.downtimeMs,
        },
      });

      return c.json({
        success: true,
        migration: {
          botId: parsed.botId,
          from: result.sourceNodeId,
          to: result.targetNodeId,
          downtimeMs: result.downtimeMs,
        },
      });
    } catch (err) {
      deps.logger?.error("Manual migration failed", { err });
      return c.json({ success: false, error: err instanceof Error ? err.message : "Unknown error" }, 500);
    }
  });

  routes.get("/regions", async (c) => {
    try {
      const regions = await deps.nodeProvisioner().listRegions();
      return c.json({ success: true, regions });
    } catch (err) {
      if (err instanceof Error && err.message.includes("DO_API_TOKEN")) {
        return c.json(
          { success: false, error: "Node provisioning not configured. Set DO_API_TOKEN environment variable." },
          503,
        );
      }
      return c.json({ success: false, error: err instanceof Error ? err.message : "Unknown error" }, 500);
    }
  });

  routes.get("/sizes", async (c) => {
    try {
      const sizes = await deps.nodeProvisioner().listSizes();
      return c.json({ success: true, sizes });
    } catch (err) {
      if (err instanceof Error && err.message.includes("DO_API_TOKEN")) {
        return c.json(
          { success: false, error: "Node provisioning not configured. Set DO_API_TOKEN environment variable." },
          503,
        );
      }
      return c.json({ success: false, error: err instanceof Error ? err.message : "Unknown error" }, 500);
    }
  });

  routes.get("/:nodeId", async (c) => {
    const nodeId = c.req.param("nodeId") as string;
    const node = await deps.nodeRepo().getById(nodeId);
    if (!node) {
      return c.json({ success: false, error: "Node not found" }, 404);
    }

    const tenants = await deps.botInstanceRepo().listByNode(nodeId);
    return c.json({ success: true, node, tenants, tenantCount: tenants.length });
  });

  routes.delete("/:nodeId", async (c) => {
    const nodeId = c.req.param("nodeId") as string;

    try {
      const node = await deps.nodeRepo().getById(nodeId);
      if (!node) {
        return c.json({ success: false, error: "Node not found" }, 404);
      }
      await deps.nodeProvisioner().destroy(nodeId);

      safeAuditLog(deps.auditLogger, {
        adminUser: (c.get("user") as { id?: string } | undefined)?.id ?? "unknown",
        action: "node.destroy",
        category: "config",
        details: { nodeId },
      });

      return c.json({ success: true });
    } catch (err) {
      deps.logger?.error("Node destruction failed", { nodeId, err });
      const status = err instanceof Error && err.message.includes("must be drained") ? 409 : 500;
      return c.json({ success: false, error: err instanceof Error ? err.message : "Unknown error" }, status);
    }
  });

  routes.get("/:nodeId/tenants", async (c) => {
    const nodeId = c.req.param("nodeId") as string;
    const tenants = await deps.botInstanceRepo().listByNode(nodeId);
    return c.json({ success: true, tenants, count: tenants.length });
  });

  routes.get("/:nodeId/stats", async (c) => {
    const nodeId = c.req.param("nodeId") as string;

    try {
      const result = await deps.commandBus().send(nodeId, { type: "stats.get", payload: {} });
      return c.json({ success: true, stats: result.data });
    } catch (err) {
      return c.json({ success: false, error: err instanceof Error ? err.message : "Unknown error" }, 500);
    }
  });

  routes.post("/:nodeId/drain", async (c) => {
    const nodeId = c.req.param("nodeId") as string;

    try {
      const result = await deps.nodeDrainer().drain(nodeId);

      safeAuditLog(deps.auditLogger, {
        adminUser: (c.get("user") as { id?: string } | undefined)?.id ?? "unknown",
        action: "node.drain",
        category: "config",
        details: { nodeId, migrated: result.migrated.length, failed: result.failed.length },
      });

      return c.json({ success: result.failed.length === 0, result });
    } catch (err) {
      deps.logger?.error("Drain failed", { nodeId, err });
      return c.json({ success: false, error: err instanceof Error ? err.message : "Unknown error" }, 500);
    }
  });

  routes.post("/:nodeId/cancel-drain", async (c) => {
    const nodeId = c.req.param("nodeId") as string;

    try {
      await deps.nodeRepo().transition(nodeId, "active", "drain_cancelled", "admin");

      safeAuditLog(deps.auditLogger, {
        adminUser: (c.get("user") as { id?: string } | undefined)?.id ?? "unknown",
        action: "node.cancelDrain",
        category: "config",
        details: { nodeId },
      });

      return c.json({ success: true, message: `Drain cancelled for node ${nodeId}` });
    } catch (err) {
      return c.json({ success: false, error: err instanceof Error ? err.message : "Unknown error" }, 500);
    }
  });

  routes.post("/:nodeId/recover", async (c) => {
    const nodeId = c.req.param("nodeId") as string;

    try {
      const report = await deps.recoveryOrchestrator().triggerRecovery(nodeId, "manual");
      return c.json({ success: true, report });
    } catch (err) {
      deps.logger?.error("Manual recovery failed", { nodeId, err });
      return c.json({ success: false, error: err instanceof Error ? err.message : "Unknown error" }, 500);
    }
  });

  return routes;
}
