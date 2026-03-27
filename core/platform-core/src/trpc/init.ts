/**
 * tRPC initialization — creates the base router and procedure builders.
 *
 * Context carries the authenticated user (if any) and the tenant ID
 * extracted from the bearer token or session.
 */

import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import type { AuthUser } from "../auth/index.js";
import { validateTenantAccess } from "../auth/index.js";
import type { IOrgMemberRepository } from "../tenancy/org-member-repository.js";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface TRPCContext {
  /** Authenticated user, or undefined for unauthenticated requests. */
  user: AuthUser | undefined;
  /** Tenant ID associated with the bearer token, if any. */
  tenantId: string | undefined;
}

// ---------------------------------------------------------------------------
// Context factory — resolves BetterAuth session into TRPCContext
// ---------------------------------------------------------------------------

/**
 * Create a TRPCContext from an incoming request.
 * Resolves the user from BetterAuth session cookies.
 */
export async function createTRPCContext(req: Request): Promise<TRPCContext> {
  let user: AuthUser | undefined;
  let tenantId: string | undefined;
  try {
    const { getAuth } = await import("../auth/better-auth.js");
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: req.headers });
    if (session?.user) {
      const sessionUser = session.user as { id: string; role?: string };
      const roles: string[] = [];
      if (sessionUser.role) roles.push(sessionUser.role);
      user = { id: sessionUser.id, roles };
      tenantId = req.headers.get("x-tenant-id") || sessionUser.id;
    }
  } catch {
    // No session — unauthenticated request
  }
  return { user, tenantId: tenantId ?? "" };
}

// ---------------------------------------------------------------------------
// tRPC init
// ---------------------------------------------------------------------------

const t = initTRPC.context<TRPCContext>().create();

/** Prefix used on user IDs for bearer-token-authenticated requests. */
const BEARER_TOKEN_ID_PREFIX = "token:";

// ---------------------------------------------------------------------------
// Org member repo injection (for tenant access validation)
// ---------------------------------------------------------------------------

let _orgMemberRepo: IOrgMemberRepository | null = null;

/** Wire the org member repository for tRPC tenant validation. Called from services.ts on startup. */
export function setTrpcOrgMemberRepo(repo: IOrgMemberRepository): void {
  _orgMemberRepo = repo;
}

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;
export const publicProcedure = t.procedure;

/**
 * Middleware that enforces authentication.
 * Narrows context so downstream resolvers get a non-optional `user`.
 */
const isAuthed = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" });
  }

  // Validate tenant access for session-cookie users when tenantId is present.
  // Bearer token users (id starts with BEARER_TOKEN_ID_PREFIX) and platform_admin users
  // have server-assigned or unrestricted tenantId — skip check.
  if (ctx.tenantId && !ctx.user.id.startsWith(BEARER_TOKEN_ID_PREFIX) && !ctx.user.roles.includes("platform_admin")) {
    if (!_orgMemberRepo) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Server misconfiguration: org member repository not wired",
      });
    }
    const allowed = await validateTenantAccess(ctx.user.id, ctx.tenantId, _orgMemberRepo);
    if (!allowed) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized for this tenant" });
    }
  }

  return next({ ctx: { user: ctx.user, tenantId: ctx.tenantId } });
});

/** Procedure that requires a valid authenticated user. */
export const protectedProcedure = t.procedure.use(isAuthed);

/**
 * Middleware that enforces the platform_admin role.
 * Must be chained after isAuthed so ctx.user is guaranteed non-optional.
 */
const isAdmin = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" });
  }
  if (!ctx.user.roles.includes("platform_admin")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Platform admin role required" });
  }
  return next({ ctx: { user: ctx.user, tenantId: ctx.tenantId } });
});

/** Procedure that requires authentication + platform_admin role. */
export const adminProcedure = t.procedure.use(isAuthed).use(isAdmin);

/**
 * Combined middleware that enforces authentication + tenant context.
 * Narrows both `user` (non-optional) and `tenantId` (non-optional string).
 * Also validates that session-cookie users have access to the claimed tenant (IDOR prevention).
 */
const isAuthedWithTenant = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" });
  }
  if (!ctx.tenantId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context required" });
  }

  // Validate tenant access for session-cookie users (bearer token users have server-assigned tenantId;
  // platform_admin users have access to all tenants).
  if (!ctx.user.id.startsWith(BEARER_TOKEN_ID_PREFIX) && !ctx.user.roles.includes("platform_admin")) {
    if (!_orgMemberRepo) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Server misconfiguration: org member repository not wired",
      });
    }
    const allowed = await validateTenantAccess(ctx.user.id, ctx.tenantId, _orgMemberRepo);
    if (!allowed) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized for this tenant" });
    }
  }

  return next({ ctx: { user: ctx.user, tenantId: ctx.tenantId } });
});

/** Procedure that requires authentication + a tenant context. */
export const tenantProcedure = t.procedure.use(isAuthedWithTenant);

/**
 * Middleware that enforces org membership for mutations that accept `orgId` in input.
 * Extracts orgId from rawInput, looks up membership via IOrgMemberRepository.
 * Must be chained after isAuthed.
 */
const isOrgMember = t.middleware(async ({ ctx, next, getRawInput }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" });
  }
  if (!_orgMemberRepo) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Server misconfiguration: org member repository not wired",
    });
  }
  const rawInput = await getRawInput();
  const parsed = z.object({ orgId: z.string().min(1) }).safeParse(rawInput);
  if (!parsed.success) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "orgId is required" });
  }
  const member = await _orgMemberRepo.findMember(parsed.data.orgId, ctx.user.id);
  if (!member) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this organization" });
  }
  return next({
    ctx: { user: ctx.user, tenantId: ctx.tenantId, orgRole: member.role as "owner" | "admin" | "member" },
  });
});

/** Procedure that requires authentication + org membership (orgId must be in input). */
export const orgMemberProcedure = t.procedure.use(isAuthed).use(isOrgMember);

/**
 * Middleware that enforces admin or owner role within an org.
 * Must be chained after isOrgMember so ctx.orgRole is guaranteed.
 */
const isOrgAdmin = t.middleware(async ({ ctx, next }) => {
  const role = (ctx as Record<string, unknown>).orgRole as string | undefined;
  if (role === "member") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin or owner role required" });
  }
  return next({ ctx });
});

/** Procedure that requires authentication + org admin/owner role (orgId must be in input). */
export const orgAdminProcedure = orgMemberProcedure.use(isOrgAdmin);
