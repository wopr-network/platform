// src/api/routes/fleet-resources.ts

import { Hono } from "hono";
import type { AuditEnv } from "../../audit/types.js";
import type { IBotInstanceRepository } from "../../fleet/bot-instance-repository.js";

// ---------------------------------------------------------------------------
// DI deps
// ---------------------------------------------------------------------------

export interface FleetResourceRouteDeps {
  botInstanceRepo: IBotInstanceRepository;
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
 *
 * After the null-target refactor, core no longer has local Docker access
 * on its own droplet and cannot read per-container CPU/memory stats
 * directly. Live stats would require an enqueued `bot.inspect` per bot —
 * too expensive for an aggregated summary endpoint. For now the route
 * reports zeros while still returning the bot count so the UI can show
 * "N running bots". A follow-up can source stats from a periodic heartbeat
 * the agents push into a metrics table.
 */
fleetResourceRoutes.get("/", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const bots = await getDeps().botInstanceRepo.listByTenant(user.id);

  return c.json({
    totalCpuPercent: 0,
    totalMemoryMb: 0,
    memoryCapacityMb: 0,
    botCount: bots.length,
  });
});
