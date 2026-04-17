/**
 * Engine REST routes for holyshippers (workers).
 *
 * These are plain HTTP endpoints that holyshippers call to:
 * - Claim work (POST /claim, POST /flows/:flow/claim)
 * - Report signals (POST /entities/:id/report)
 * - Report failures (POST /entities/:id/fail)
 * - Get entity details (GET /entities/:id)
 * - Get engine status (GET /status)
 */

import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import type { Engine } from "../engine/engine.js";
import type { IEntityRepository, IFlowRepository, IInvocationRepository } from "../repositories/interfaces.js";

export interface EngineRouteDeps {
  engine: Engine;
  entities: IEntityRepository;
  flows: IFlowRepository;
  invocations: IInvocationRepository;
  workerToken?: string;
  /** Used by session-auth fallback on read routes — resolves to core's
   *  /api/auth/get-session to validate a browser session cookie. */
  coreUrl?: string;
}

function tokensMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function createEngineRoutes(deps: EngineRouteDeps): Hono {
  const app = new Hono();

  // Auth for engine endpoints. There are two kinds of caller:
  //  - Holyshippers (worker containers) hit write routes (/claim, report/fail,
  //    POST /entities) with a bearer worker token resolved from Vault.
  //  - The UI (browser on holyship.wtf) needs to read entity/flow/status to
  //    render pipeline + entity detail — worker token isn't available in the
  //    session, so we validate the BetterAuth cookie by asking core's
  //    /api/auth/get-session.
  //
  // Before this split, the worker-token middleware guarded everything and the
  // Pipeline view always rendered "No entities in the pipeline" from the
  // 401 response.
  const validateWorkerToken = (authHeader: string | undefined): true | Response => {
    if (!deps.workerToken) return true; // token not configured → open
    if (!authHeader) return new Response(JSON.stringify({ error: "Missing Authorization header" }), { status: 401 });
    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
      return new Response(JSON.stringify({ error: "Invalid Authorization format" }), { status: 401 });
    }
    if (!tokensMatch(parts[1], deps.workerToken)) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 403 });
    }
    return true;
  };

  const requireWorkerToken = async (
    c: Parameters<Parameters<typeof app.use>[1]>[0],
    next: Parameters<Parameters<typeof app.use>[1]>[1],
  ) => {
    const result = validateWorkerToken(c.req.header("Authorization"));
    if (result !== true) return result;
    return next();
  };

  /**
   * Try worker-token auth first (for holyshippers). If that fails AND the
   * caller has session cookies, validate against core's get-session. Reject
   * otherwise.
   */
  const requireWorkerOrSession = async (
    c: Parameters<Parameters<typeof app.use>[1]>[0],
    next: Parameters<Parameters<typeof app.use>[1]>[1],
  ) => {
    // Path A: valid worker token → let through.
    const authHeader = c.req.header("Authorization");
    if (authHeader && deps.workerToken) {
      const tokenResult = validateWorkerToken(authHeader);
      if (tokenResult === true) return next();
    }

    // Path B: browser session cookie → ask core.
    const cookie = c.req.header("Cookie");
    if (!cookie || !deps.coreUrl) {
      return c.json({ error: "Unauthorized — provide a worker token or a logged-in session cookie" }, 401);
    }
    try {
      const res = await fetch(`${deps.coreUrl}/api/auth/get-session`, {
        headers: { Cookie: cookie, "X-Product": "holyship" },
      });
      if (!res.ok) return c.json({ error: "Session invalid" }, 401);
      const body = (await res.json().catch(() => null)) as { user?: { id?: string } } | null;
      if (!body?.user?.id) return c.json({ error: "Session has no user" }, 401);
    } catch (err) {
      return c.json({ error: `Session validation failed: ${(err as Error).message}` }, 502);
    }
    return next();
  };

  // Write routes — worker-token only. Includes POST /entities (admin/testing
  // creation) — session users shouldn't be able to spawn entities outside of
  // the ship-it flow.
  app.use("/claim", requireWorkerToken);
  app.use("/flows/:flow/claim", requireWorkerToken);
  app.use("/entities/:id/report", requireWorkerToken);
  app.use("/entities/:id/fail", requireWorkerToken);

  // Read routes — worker token OR session cookie. Note: POST /entities also
  // matches `/entities`, so the catch-all `app.use("/entities", ...)` would
  // accidentally allow session users to create entities. Apply the middleware
  // inline on the GET handler instead.

  // POST /claim — claim next available entity (any flow)
  app.post("/claim", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const workerId = (body.worker_id as string) ?? undefined;
    const role = (body.role as string) ?? "engineering";
    const result = await deps.engine.claimWork(role, undefined, workerId);
    if (!result) {
      return c.json({ next_action: "check_back", retry_after_ms: 30_000, message: "No work available" }, 200);
    }
    return c.json(result, 200);
  });

  // POST /flows/:flow/claim — claim from specific flow
  app.post("/flows/:flow/claim", async (c) => {
    const flowName = c.req.param("flow");
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const workerId = (body.worker_id as string) ?? undefined;
    const role = (body.role as string) ?? "engineering";
    const result = await deps.engine.claimWork(role, flowName, workerId);
    if (!result) {
      return c.json({ next_action: "check_back", retry_after_ms: 30_000, message: "No work available" }, 200);
    }
    return c.json(result, 200);
  });

  // POST /entities/:id/report — report a signal
  app.post("/entities/:id/report", async (c) => {
    const entityId = c.req.param("id");
    const body = (await c.req.json()) as Record<string, unknown>;
    const signal = body.signal as string;
    if (!signal) return c.json({ error: "signal is required" }, 400);
    const artifacts = (body.artifacts as Record<string, unknown>) ?? undefined;
    const result = await deps.engine.processSignal(entityId, signal, artifacts);
    return c.json(result, 200);
  });

  // POST /entities/:id/fail — report failure
  app.post("/entities/:id/fail", async (c) => {
    const entityId = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const reason = (body.reason as string) ?? "unknown";
    const result = await deps.engine.processSignal(entityId, "fail", { failureReason: reason });
    return c.json(result, 200);
  });

  // GET /entities/:id/detail — enriched entity with invocations and timeline
  app.get("/entities/:id/detail", requireWorkerOrSession, async (c) => {
    const entity = await deps.entities.get(c.req.param("id"));
    if (!entity) return c.json({ error: "Not found" }, 404);
    const invocations = await deps.invocations.findByEntity(entity.id);
    // Include invocations that never started — previously filtered out, which
    // hid exactly the failures we needed to see (claim happened, provision
    // threw before startedAt was set). Sort by startedAt when present, else
    // fall back to claimedAt so pending/pre-start invocations still appear
    // in order.
    const timeline = invocations
      .slice()
      .sort((a, b) => {
        const ta = (a.startedAt ?? a.claimedAt ?? new Date(0)).getTime();
        const tb = (b.startedAt ?? b.claimedAt ?? new Date(0)).getTime();
        return ta - tb;
      })
      .map((inv) => ({
        id: inv.id,
        stage: inv.stage,
        agentRole: inv.agentRole,
        signal: inv.signal,
        error: inv.error,
        claimedBy: inv.claimedBy,
        claimedAt: inv.claimedAt,
        startedAt: inv.startedAt,
        completedAt: inv.completedAt,
        failedAt: inv.failedAt,
        artifactKeys: Object.keys(inv.artifacts ?? {}),
      }));
    return c.json({ entity, invocations: timeline }, 200);
  });

  // GET /entities/:id — get entity
  app.get("/entities/:id", requireWorkerOrSession, async (c) => {
    const entity = await deps.entities.get(c.req.param("id"));
    if (!entity) return c.json({ error: "Not found" }, 404);
    return c.json(entity, 200);
  });

  // GET /entities — list entities
  app.get("/entities", requireWorkerOrSession, async (c) => {
    const flowId = c.req.query("flowId");
    const state = c.req.query("state");
    // Cap at 200 so a caller passing `?limit=1000000` can't force a full tenant
    // scan; 50 stays the default for backward compat.
    const MAX_LIMIT = 200;
    const limit = Math.min(Number(c.req.query("limit") || 50) || 50, MAX_LIMIT);
    if (flowId && state) {
      const entities = await deps.entities.findByFlowAndState(flowId, state, limit);
      return c.json(entities, 200);
    }
    // Default: return every entity for the tenant, newest first. Previously
    // this fell through to findByFlowAndState("*","*") which does an equality
    // match on the literal string and always returned [], breaking the
    // pipeline view.
    const entities = await deps.entities.list(limit);
    return c.json(entities, 200);
  });

  // POST /entities — create entity (admin/testing). Worker token required —
  // session users go through /api/ship-it for controlled entity creation.
  app.post("/entities", requireWorkerToken, async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const flow = (body.flow as string) ?? "engineering";
    const refs = (body.refs as Record<string, unknown>) ?? {};
    const entity = await deps.engine.createEntity(flow, undefined, refs);
    return c.json(entity, 201);
  });

  // GET /flows — list all flow definitions
  app.get("/flows", requireWorkerOrSession, async (c) => {
    const flows = await deps.flows.list();
    return c.json(flows, 200);
  });

  // GET /status — engine status
  app.get("/status", requireWorkerOrSession, async (c) => {
    const status = await deps.engine.getStatus();
    return c.json(status, 200);
  });

  return app;
}
