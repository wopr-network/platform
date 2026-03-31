// src/api/routes/fleet-resources.ts

import { Hono } from "hono";
import type { AuditEnv } from "../../audit/types.js";
import type { FleetManager } from "../../fleet/fleet-manager.js";

// ---------------------------------------------------------------------------
// DI deps
// ---------------------------------------------------------------------------

export interface FleetResourceRouteDeps {
  fleet: FleetManager;
}

let _deps: FleetResourceRouteDeps | null = null;

/** Inject dependencies (call before serving). */
export function setFleetResourceDeps(deps: FleetResourceRouteDeps): void {
  _deps = deps;
}

function getDeps(): FleetResourceRouteDeps {
  if (!_deps) {
    throw new Error("Fleet resource routes not initialized — call setFleetResourceDeps() first");
  }
  return _deps;
}

// BOUNDARY(WOP-805): This REST route is a tRPC migration candidate.
// The UI calls GET /api/fleet/resources via session cookie. Should become
// a tRPC procedure (e.g., fleet.resources) for type safety.
// Blocker: none — straightforward migration.
export const fleetResourceRoutes = new Hono<AuditEnv>();

/**
 * GET /api/fleet/resources
 *
 * Aggregated CPU/memory summary across all running bot instances.
 * This endpoint is under /api/* (session auth), not /fleet/* (bearer auth).
 */
fleetResourceRoutes.get("/", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const bots = await getDeps().fleet.listByTenant(user.id);

  let totalCpuPercent = 0;
  let totalMemoryMb = 0;
  let memoryCapacityMb = 0;

  for (const bot of bots) {
    if (bot.stats) {
      totalCpuPercent += bot.stats.cpuPercent;
      totalMemoryMb += bot.stats.memoryUsageMb;
      memoryCapacityMb += bot.stats.memoryLimitMb;
    }
  }

  return c.json({
    totalCpuPercent: Math.round(totalCpuPercent * 100) / 100,
    totalMemoryMb,
    memoryCapacityMb,
  });
});
