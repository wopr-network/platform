import { Hono } from "hono";
import { z } from "zod";
import type { AuthEnv } from "../../auth/index.js";
import type { AdminAuditLogger } from "./admin-audit-helper.js";
import { safeAuditLog } from "./admin-audit-helper.js";

/** Minimal interface for GPU node repository. */
export interface IGpuNodeRepository {
  list(): Promise<unknown[]>;
  getById(nodeId: string): Promise<{ dropletId?: string | number | null; status?: string } | null>;
}

/** Minimal interface for GPU node provisioner. */
export interface IGpuNodeProvisioner {
  provision(opts: { region?: string; size?: string; name?: string }): Promise<{
    nodeId: string;
    dropletId?: string | number | null;
    region?: string;
    size?: string;
    monthlyCostCents?: number;
  }>;
  destroy(nodeId: string): Promise<void>;
}

/** Minimal interface for DO API client. */
export interface IDOClient {
  listRegions(): Promise<unknown[]>;
  listSizes(): Promise<unknown[]>;
  rebootDroplet(dropletId: number): Promise<void>;
}

export interface AdminGpuDeps {
  gpuNodeRepo: () => IGpuNodeRepository;
  gpuNodeProvisioner: () => IGpuNodeProvisioner;
  doClient: () => IDOClient;
  auditLogger?: () => AdminAuditLogger;
  logger?: { error(msg: string, meta?: Record<string, unknown>): void };
}

/**
 * Create admin GPU node management routes.
 * Static routes (/regions, /sizes) are registered BEFORE parameterized routes (/:nodeId).
 */
export function createAdminGpuRoutes(deps: AdminGpuDeps): Hono<AuthEnv> {
  const routes = new Hono<AuthEnv>();

  routes.get("/", async (c) => {
    const nodes = await deps.gpuNodeRepo().list();
    return c.json({ success: true, nodes, count: nodes.length });
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

      const provisioner = deps.gpuNodeProvisioner();
      const result = await provisioner.provision(parsed);

      safeAuditLog(deps.auditLogger, {
        adminUser: (c.get("user") as { id?: string } | undefined)?.id ?? "unknown",
        action: "gpu.provision",
        category: "config",
        details: {
          nodeId: result.nodeId,
          dropletId: result.dropletId,
          region: result.region,
          size: result.size,
          monthlyCostCents: result.monthlyCostCents,
        },
      });

      return c.json({ success: true, node: result }, 201);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return c.json({ success: false, error: err.issues }, 400);
      }
      if (err instanceof Error && err.message.includes("DO_API_TOKEN")) {
        return c.json(
          { success: false, error: "GPU provisioning not configured. Set DO_API_TOKEN environment variable." },
          503,
        );
      }
      deps.logger?.error("GPU node provisioning failed", { err });
      return c.json({ success: false, error: err instanceof Error ? err.message : "Unknown error" }, 500);
    }
  });

  routes.get("/regions", async (c) => {
    try {
      const regions = await deps.doClient().listRegions();
      return c.json({ success: true, regions });
    } catch (err) {
      if (err instanceof Error && err.message.includes("DO_API_TOKEN")) {
        return c.json(
          { success: false, error: "GPU provisioning not configured. Set DO_API_TOKEN environment variable." },
          503,
        );
      }
      return c.json({ success: false, error: err instanceof Error ? err.message : "Unknown error" }, 500);
    }
  });

  routes.get("/sizes", async (c) => {
    try {
      const sizes = await deps.doClient().listSizes();
      return c.json({ success: true, sizes });
    } catch (err) {
      if (err instanceof Error && err.message.includes("DO_API_TOKEN")) {
        return c.json(
          { success: false, error: "GPU provisioning not configured. Set DO_API_TOKEN environment variable." },
          503,
        );
      }
      return c.json({ success: false, error: err instanceof Error ? err.message : "Unknown error" }, 500);
    }
  });

  routes.get("/:nodeId", async (c) => {
    const nodeId = c.req.param("nodeId") as string;
    const node = await deps.gpuNodeRepo().getById(nodeId);
    if (!node) {
      return c.json({ success: false, error: "GPU node not found" }, 404);
    }
    return c.json({ success: true, node });
  });

  routes.delete("/:nodeId", async (c) => {
    const nodeId = c.req.param("nodeId") as string;

    try {
      const node = await deps.gpuNodeRepo().getById(nodeId);
      if (!node) {
        return c.json({ success: false, error: "GPU node not found" }, 404);
      }
      if (node.status === "provisioning" || node.status === "bootstrapping") {
        return c.json(
          {
            success: false,
            error: `Cannot destroy GPU node in ${node.status} state — wait until provisioning/bootstrapping completes`,
          },
          409,
        );
      }

      await deps.gpuNodeProvisioner().destroy(nodeId);

      safeAuditLog(deps.auditLogger, {
        adminUser: (c.get("user") as { id?: string } | undefined)?.id ?? "unknown",
        action: "gpu.destroy",
        category: "config",
        details: { nodeId },
      });

      return c.json({ success: true });
    } catch (err) {
      deps.logger?.error("GPU node destruction failed", { nodeId, err });
      return c.json({ success: false, error: err instanceof Error ? err.message : "Unknown error" }, 500);
    }
  });

  routes.post("/:nodeId/reboot", async (c) => {
    const nodeId = c.req.param("nodeId") as string;

    try {
      const node = await deps.gpuNodeRepo().getById(nodeId);
      if (!node) {
        return c.json({ success: false, error: "GPU node not found" }, 404);
      }
      if (!node.dropletId) {
        return c.json({ success: false, error: "GPU node has no droplet assigned" }, 400);
      }

      await deps.doClient().rebootDroplet(Number(node.dropletId));

      safeAuditLog(deps.auditLogger, {
        adminUser: (c.get("user") as { id?: string } | undefined)?.id ?? "unknown",
        action: "gpu.reboot",
        category: "config",
        details: { nodeId, dropletId: node.dropletId },
      });

      return c.json({ success: true, message: `Reboot initiated for GPU node ${nodeId}` });
    } catch (err) {
      deps.logger?.error("GPU node reboot failed", { nodeId, err });
      return c.json({ success: false, error: err instanceof Error ? err.message : "Unknown error" }, 500);
    }
  });

  return routes;
}
