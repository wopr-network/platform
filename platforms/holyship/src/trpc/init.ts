/**
 * Holyship's own tRPC initialization.
 *
 * Replaces platform-core's tRPC — holyship defines its own procedures
 * with auth validation against core (not local BetterAuth).
 */

import { initTRPC, TRPCError } from "@trpc/server";
import type { SessionUser } from "../auth/validate-session.js";
import { validateSession } from "../auth/validate-session.js";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface TRPCContext {
  req: Request;
  /** Set by createContext — null if unauthenticated. */
  user: SessionUser | null;
}

export interface ProtectedCtx extends TRPCContext {
  user: SessionUser;
}

export interface TenantCtx extends ProtectedCtx {
  tenantId: string;
}

/**
 * Create tRPC context from a raw request.
 * Validates session ONCE per request (not per procedure).
 */
export async function createTRPCContext(req: Request): Promise<TRPCContext> {
  const session = await validateSession(req);
  return { req, user: session?.user ?? null };
}

// ---------------------------------------------------------------------------
// tRPC instance
// ---------------------------------------------------------------------------

const t = initTRPC.context<TRPCContext>().create();

export const router = t.router;
export const middleware = t.middleware;

// ---------------------------------------------------------------------------
// Procedures
// ---------------------------------------------------------------------------

/** No auth required. */
export const publicProcedure = t.procedure;

/** Requires authenticated user. */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } as ProtectedCtx });
});

/** Requires authenticated user + tenant context (from X-Tenant-Id header or user ID). */
export const tenantProcedure = protectedProcedure.use(({ ctx, next }) => {
  const tenantId = ctx.req.headers.get("x-tenant-id") ?? ctx.user.id;
  return next({ ctx: { ...ctx, tenantId } as TenantCtx });
});

/**
 * Requires authenticated user + org membership.
 * Core validates actual membership when we forward calls via core-client.
 */
export const orgMemberProcedure = protectedProcedure.use(({ ctx, next }) => {
  const tenantId = ctx.req.headers.get("x-tenant-id") ?? ctx.user.id;
  return next({ ctx: { ...ctx, tenantId } as TenantCtx });
});
