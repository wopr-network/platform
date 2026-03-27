import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { logger } from "../../config/logger.js";

const VALID_STAGES = [
  "installing_drivers",
  "installing_docker",
  "downloading_models",
  "starting_services",
  "registering",
  "done",
] as const;

type ProvisionStage = (typeof VALID_STAGES)[number];

export interface GpuNodeStageUpdater {
  updateStage(nodeId: string, stage: string): Promise<void>;
  updateStatus(nodeId: string, status: string): Promise<void>;
}

/**
 * Create internal GPU routes for node provisioning status updates.
 *
 * @param gpuSecretFactory - returns the GPU_NODE_SECRET (lazy to avoid env read at load time)
 * @param repoFactory - returns the GPU node repository
 */
export function createInternalGpuRoutes(
  gpuSecretFactory: () => string | undefined,
  repoFactory: () => GpuNodeStageUpdater,
): Hono {
  const routes = new Hono();

  routes.post("/register", async (c) => {
    const gpuSecret = gpuSecretFactory();
    if (!gpuSecret) {
      logger.warn("GPU_NODE_SECRET not configured");
      return c.json({ success: false, error: "Unauthorized" }, 401);
    }

    const authHeader = c.req.header("Authorization");
    const bearer = authHeader?.replace(/^Bearer\s+/i, "");
    if (!bearer) {
      return c.json({ success: false, error: "Unauthorized" }, 401);
    }

    const a = Buffer.from(bearer);
    const b = Buffer.from(gpuSecret);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return c.json({ success: false, error: "Unauthorized" }, 401);
    }

    const stage = c.req.query("stage") as ProvisionStage | undefined;
    if (!stage || !VALID_STAGES.includes(stage)) {
      return c.json({ success: false, error: `Invalid or missing stage. Valid: ${VALID_STAGES.join(", ")}` }, 400);
    }

    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return c.json({ success: false, error: "Invalid JSON body" }, 400);
    }

    if (
      typeof rawBody !== "object" ||
      rawBody === null ||
      typeof (rawBody as Record<string, unknown>).nodeId !== "string"
    ) {
      return c.json({ success: false, error: "Missing required field: nodeId" }, 400);
    }

    const { nodeId } = rawBody as { nodeId: string };

    const repo = repoFactory();
    try {
      await repo.updateStage(nodeId, stage);
      if (stage === "done") {
        await repo.updateStatus(nodeId, "active");
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes("not found")) {
        return c.json({ success: false, error: `GPU node not found: ${nodeId}` }, 404);
      }
      throw err;
    }

    logger.info(`GPU node ${nodeId} stage updated to ${stage}`);
    return c.json({ success: true });
  });

  return routes;
}
