import type { Context, Next } from "hono";
import { Hono } from "hono";
import { isValidRole, RoleStore } from "../../admin/role-store.js";
import type { AuthEnv } from "../../auth/index.js";
import type { AdminAuditLogger } from "./admin-audit-helper.js";
import { safeAuditLog } from "./admin-audit-helper.js";

// ── Role middleware (generic, no WOPR deps) ──

function resolveRoleStore(storeOrFactory: RoleStore | (() => RoleStore)): RoleStore {
  return typeof storeOrFactory === "function" ? storeOrFactory() : storeOrFactory;
}

export function requirePlatformAdmin(storeOrFactory: RoleStore | (() => RoleStore)) {
  return async (c: Context<AuthEnv>, next: Next) => {
    let user: { id: string; roles: string[] } | undefined;
    try {
      user = c.get("user");
    } catch {
      return c.json({ error: "Authentication required" }, 401);
    }

    if (!user) {
      return c.json({ error: "Authentication required" }, 401);
    }

    if (!user.roles.includes("admin") && !(await resolveRoleStore(storeOrFactory).isPlatformAdmin(user.id))) {
      return c.json({ error: "Platform admin access required" }, 403);
    }

    return next();
  };
}

export function requireTenantAdmin(storeOrFactory: RoleStore | (() => RoleStore), tenantIdKey = "tenantId") {
  return async (c: Context<AuthEnv>, next: Next) => {
    let user: { id: string; roles: string[] } | undefined;
    try {
      user = c.get("user");
    } catch {
      return c.json({ error: "Authentication required" }, 401);
    }

    if (!user) {
      return c.json({ error: "Authentication required" }, 401);
    }

    if (user.roles.includes("admin") || (await resolveRoleStore(storeOrFactory).isPlatformAdmin(user.id))) {
      return next();
    }

    const tenantId = c.req.param(tenantIdKey);
    if (!tenantId) {
      return c.json({ error: "Tenant ID required" }, 400);
    }

    const role = await resolveRoleStore(storeOrFactory).getRole(user.id, tenantId);
    if (role !== "tenant_admin") {
      return c.json({ error: "Tenant admin access required" }, 403);
    }

    return next();
  };
}

// ── Route factories ──

/**
 * Create admin role management API routes.
 * Takes a RoleStore factory and optional audit logger.
 */
export function createAdminRolesRoutes(
  storeFactory: () => RoleStore,
  auditLogger?: () => AdminAuditLogger,
): Hono<AuthEnv> {
  const routes = new Hono<AuthEnv>();

  routes.get("/:tenantId", requireTenantAdmin(storeFactory), async (c) => {
    const tenantId = c.req.param("tenantId") as string;
    const roles = await storeFactory().listByTenant(tenantId);
    return c.json({ roles });
  });

  routes.put("/:tenantId/:userId", requireTenantAdmin(storeFactory), async (c) => {
    const tenantId = c.req.param("tenantId") as string;
    const userId = c.req.param("userId") as string;
    const body = await c.req.json<{ role: string }>().catch(() => null);

    if (!body?.role || !isValidRole(body.role)) {
      return c.json({ error: "Invalid role. Must be: platform_admin, tenant_admin, or user" }, 400);
    }

    if (body.role === "platform_admin") {
      return c.json({ error: "platform_admin can only be granted via platform admin routes" }, 400);
    }

    const currentUser = c.get("user");

    await storeFactory().setRole(userId, tenantId, body.role, currentUser.id);

    safeAuditLog(auditLogger, {
      adminUser: currentUser.id ?? "unknown",
      action: "role.set",
      category: "roles",
      targetTenant: tenantId,
      targetUser: userId,
      details: { role: body.role },
      outcome: "success",
    });

    return c.json({ ok: true });
  });

  routes.delete("/:tenantId/:userId", requireTenantAdmin(storeFactory), async (c) => {
    const tenantId = c.req.param("tenantId") as string;
    const userId = c.req.param("userId") as string;

    const removed = await storeFactory().removeRole(userId, tenantId);
    if (!removed) {
      return c.json({ error: "Role not found" }, 404);
    }

    const currentUser = c.get("user");
    safeAuditLog(auditLogger, {
      adminUser: currentUser?.id ?? "unknown",
      action: "role.remove",
      category: "roles",
      targetTenant: tenantId,
      targetUser: userId,
      details: {},
      outcome: "success",
    });

    return c.json({ ok: true });
  });

  return routes;
}

/**
 * Create platform admin management routes.
 * Takes a RoleStore factory and optional audit logger.
 */
export function createPlatformAdminRoutes(
  storeFactory: () => RoleStore,
  auditLogger?: () => AdminAuditLogger,
): Hono<AuthEnv> {
  const routes = new Hono<AuthEnv>();

  routes.use("*", requirePlatformAdmin(storeFactory));

  routes.get("/", async (c) => {
    const admins = await storeFactory().listPlatformAdmins();
    return c.json({ admins });
  });

  routes.post("/", async (c) => {
    const body = await c.req.json<{ userId: string }>().catch(() => null);

    if (!body?.userId) {
      return c.json({ error: "userId is required" }, 400);
    }

    const currentUser = c.get("user");
    await storeFactory().setRole(body.userId, RoleStore.PLATFORM_TENANT, "platform_admin", currentUser.id);

    safeAuditLog(auditLogger, {
      adminUser: currentUser.id ?? "unknown",
      action: "platform_admin.add",
      category: "roles",
      targetUser: body.userId,
      details: {},
      outcome: "success",
    });

    return c.json({ ok: true });
  });

  routes.delete("/:userId", async (c) => {
    const userId = c.req.param("userId") as string;

    if ((await storeFactory().countPlatformAdmins()) <= 1 && (await storeFactory().isPlatformAdmin(userId))) {
      return c.json({ error: "Cannot remove the last platform admin" }, 409);
    }

    const removed = await storeFactory().removeRole(userId, RoleStore.PLATFORM_TENANT);
    if (!removed) {
      return c.json({ error: "Platform admin not found" }, 404);
    }

    const currentUser = c.get("user");
    safeAuditLog(auditLogger, {
      adminUser: currentUser?.id ?? "unknown",
      action: "platform_admin.remove",
      category: "roles",
      targetUser: userId,
      details: {},
      outcome: "success",
    });

    return c.json({ ok: true });
  });

  return routes;
}
