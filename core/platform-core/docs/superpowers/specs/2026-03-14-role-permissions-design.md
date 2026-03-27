# Role Management & Permissions

**Date:** 2026-03-14
**Status:** Draft
**Repos:** platform-core, platform-ui-core, paperclip, paperclip-platform, paperclip-platform-ui
**Depends on:** `2026-03-14-paperclip-org-integration-design.md` (ships together or in strict sequence — this spec amends the org integration spec's `addMember`/`changeRole` to include permission grant provisioning)

## Problem

The platform has three org roles (owner/admin/member) that gate team management operations. But billing, fleet operations, update preferences, and Paperclip-internal permissions have no role gating. A member can see billing info, restart bots, create agents, and view costs — all of which should be admin-only.

The platform controls the whole stack. Role enforcement happens at the right level: platform gates platform features, Paperclip gates Paperclip features. No workarounds.

## Design

### Permission Model

Three fixed roles. No per-user customization. Simple, predictable, covers the product.

**Owner** — full control. One per org.
**Admin** — manages team, billing, fleet, agents. Cannot delete org or transfer ownership.
**Member** — uses the product. Issues, projects, org chart. Nothing else.

### Permission Matrix

| Capability | Owner | Admin | Member |
|---|---|---|---|
| **Team** | | | |
| Invite members | Y | Y | N |
| Remove members | Y | Y | N |
| Change roles | Y | Y | N |
| Transfer ownership | Y | N | N |
| Delete org | Y | N | N |
| **Billing** | | | |
| View balance/usage/invoices | Y | Y | N |
| Top up credits | Y | Y | N |
| **Fleet** | | | |
| Start/stop/restart bot | Y | Y | N |
| Trigger manual update | Y | Y | N |
| Set update mode (auto/manual) | Y | Y | N |
| View logs | Y | Y | Y |
| View bot status/health | Y | Y | Y |
| View changelog | Y | Y | Y |
| **Inside Paperclip** | | | |
| Create/manage agents | Y | Y | N |
| View costs | Y | Y | N |
| Delete company data | Y | N | N |
| Create/edit issues | Y | Y | Y |
| Create/edit projects | Y | Y | Y |
| View org chart | Y | Y | Y |

### Where Enforcement Happens

Permissions are enforced at the correct layer — no double-gating, no workarounds.

```
Platform (tRPC routes)
  ├─ Team management    → already gated by OrgService (owner/admin check on line 310)
  ├─ Billing routes     → gate behind admin/owner role check
  ├─ Fleet routes       → gate start/stop/restart/update behind admin/owner
  └─ Fleet read routes  → allow all members (logs, status, health, changelog)

Platform UI (platform-ui-core)
  ├─ Settings tabs      → hide billing, fleet controls, team tabs for members
  ├─ Update button      → hide for members (admin/owner only)
  └─ Bot controls       → hide start/stop/restart for members

Paperclip (provisioned permissions)
  ├─ Agent management   → admin/owner get permission grants; members don't
  ├─ Cost visibility    → admin/owner get cost view grants; members don't
  ├─ Company deletion   → owner only gets delete grant
  └─ Issues/projects    → all roles get full issue/project permissions
```

### 1. Platform-Side Role Gating (tRPC)

**File:** `paperclip-platform/src/trpc/routers/fleet.ts`

Fleet mutation routes (start, stop, restart, destroy, update) need admin/owner checks.

**Prerequisite:** Today's `orgMemberProcedure` only checks membership existence — it does NOT check role or expose `member.role` to the context. A new `orgAdminProcedure` middleware is needed in platform-core:

```typescript
// platform-core: new middleware
const orgAdminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const member = await orgMemberRepo.findMember(ctx.tenantId, ctx.user.id);
  if (!member || member.role === "member") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin or owner role required" });
  }
  return next({ ctx: { ...ctx, orgRole: member.role } });
});
```

Also extend `orgMemberProcedure` to attach `ctx.orgRole` so downstream code can read the role without re-querying.

Fleet mutation routes switch from `protectedProcedure` to `orgAdminProcedure`. Fleet read routes (listInstances, getInstance, getInstanceHealth, getInstanceLogs) use `orgMemberProcedure` — accessible to all members.

**File:** `paperclip-platform/src/trpc/routers/org.ts`

Billing routes need admin/owner checks. The existing `requireAdminOrOwner` pattern at line 310 of `platform-core/src/tenancy/org-service.ts` should be extracted into a reusable helper:

```typescript
// platform-core/src/tenancy/org-service.ts
async requireAdminOrOwner(orgId: string, userId: string): Promise<void> {
  const member = await this.memberRepo.findMember(orgId, userId);
  if (!member || (member.role !== "admin" && member.role !== "owner")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin or owner role required" });
  }
}

async requireOwner(orgId: string, userId: string): Promise<void> {
  const org = await this.orgRepo.getOrg(orgId);
  if (!org || org.ownerId !== userId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Owner role required" });
  }
}
```

Apply to routes:

| Route | Gate |
|-------|------|
| `orgBillingBalance` | `requireAdminOrOwner` |
| `orgBillingInfo` | `requireAdminOrOwner` |
| `orgMemberUsage` | `requireAdminOrOwner` |
| `orgTopupCheckout` | `requireAdminOrOwner` |
| `orgSetupIntent` | `requireAdminOrOwner` |
| `inviteMember` | `requireAdminOrOwner` (already gated) |
| `removeMember` | `requireAdminOrOwner` (already gated) |
| `changeRole` | `requireAdminOrOwner` (already gated) |
| `deleteOrganization` | `requireOwner` (already gated) |
| `transferOwnership` | `requireOwner` (already gated) |

### 2. Platform UI Role Gating

**File:** `platform-ui-core/src/app/(dashboard)/settings/`

The settings page needs to conditionally render tabs based on the user's role. The user's role is available from the org context (tRPC `getOrganization` response includes the member list with roles).

```typescript
// Hook: useMyOrgRole()
// Returns "owner" | "admin" | "member" | null
// Derived from org.members.find(m => m.userId === currentUser.id)?.role

const role = useMyOrgRole();
const isAdminOrOwner = role === "admin" || role === "owner";
```

**Tab visibility:**

| Tab | Visible to |
|-----|-----------|
| Team / Members | admin, owner |
| Billing | admin, owner |
| Bot Management (start/stop/restart) | admin, owner |
| Update Preferences | admin, owner |
| Bot Status / Logs | all |
| General Settings (name, etc.) | admin, owner |

Members see a simplified dashboard: bot status, logs, changelog. No controls, no billing, no team management.

**Update modal:**

The "Update Available" badge and changelog are visible to all roles. The "Update Now" button is only visible to admin/owner. Members see the changelog but can't trigger the update.

### 3. Paperclip-Side Permission Provisioning

**File:** `paperclip/server/src/routes/provision.ts`

When the platform provisions a user into Paperclip (via `addMember`), it also sets their permissions based on their platform role. This uses Paperclip's existing `principalPermissionGrants` system.

**Permission grants by role:**

Paperclip uses colon-delimited permission keys defined in `@paperclipai/shared/constants.ts`. The existing keys are: `agents:create`, `users:invite`, `users:manage_permissions`, `tasks:assign`, `tasks:assign_scope`, `joins:approve`.

**Prerequisite:** Several permission keys needed for role-based gating do not exist yet. These must be added to `PERMISSION_KEYS` in `paperclip/packages/shared/src/constants.ts` before implementation:

| New Key | Purpose |
|---------|---------|
| `agents:update` | Edit agent config |
| `agents:delete` | Remove agents |
| `costs:view` | See budget/spending |
| `company:delete` | Delete entire company |

```typescript
import type { PermissionKey } from "@paperclipai/shared";

type GrantInput = { permissionKey: PermissionKey; scope?: Record<string, unknown> | null };

const ROLE_PERMISSIONS: Record<string, GrantInput[]> = {
  owner: [
    { permissionKey: "agents:create" },
    { permissionKey: "agents:update" },
    { permissionKey: "agents:delete" },
    { permissionKey: "costs:view" },
    { permissionKey: "company:delete" },
    { permissionKey: "users:invite" },
    { permissionKey: "users:manage_permissions" },
    { permissionKey: "tasks:assign" },
    { permissionKey: "joins:approve" },
  ],
  admin: [
    { permissionKey: "agents:create" },
    { permissionKey: "agents:update" },
    { permissionKey: "agents:delete" },
    { permissionKey: "costs:view" },
    { permissionKey: "users:invite" },
    { permissionKey: "users:manage_permissions" },
    { permissionKey: "tasks:assign" },
    { permissionKey: "joins:approve" },
  ],
  member: [
    { permissionKey: "tasks:assign" },
  ],
};
```

**Note:** Issues and projects have no permission gates in Paperclip today — all company members can create/edit them. The org chart is also ungated — all authenticated users see it. No new keys needed for these.

This spec **amends** the org integration spec's `addMember` and `changeRole` provision endpoints to include permission grant provisioning. Both changes ship together.

The `addMember` provision endpoint sets these grants:

```typescript
async addMember(companyId: string, user: AdminUser, role: "owner" | "admin" | "member") {
  await this.ensureUser(user);
  const paperclipRole = role === "member" ? "member" : "owner";
  await access.ensureMembership(companyId, "user", user.id, paperclipRole, "active");
  if (paperclipRole === "owner") {
    await access.promoteInstanceAdmin(user.id);
  }

  // Set permission grants based on platform role
  const grants = ROLE_PERMISSIONS[role] ?? ROLE_PERMISSIONS.member;
  await access.setPrincipalGrants(companyId, "user", user.id, grants, "platform");
}
```

The `changeRole` endpoint updates grants when a role changes:

```typescript
async changeRole(companyId: string, userId: string, role: "owner" | "admin" | "member") {
  // ... existing role/membership logic from org integration spec ...

  // Update permission grants to match new role
  const grants = ROLE_PERMISSIONS[role] ?? ROLE_PERMISSIONS.member;
  await access.setPrincipalGrants(companyId, "user", userId, grants, "platform");
}
```

### 4. Paperclip UI Enforcement (hostedMode)

Paperclip's UI already has a permission system, but some controls need hostedMode-specific hiding. In hosted mode, the platform is the authority — Paperclip should not show controls that the platform's role doesn't allow.

**Agent management controls:**
Already gated by the `agent.create` permission grant. Members without the grant won't see create/edit/delete agent buttons. No additional hostedMode guard needed — the permission system handles it.

**Cost page:**
Gate behind `costs:view` permission. Members without it see a "Contact your admin" message or the page is hidden from navigation entirely.

**Company deletion:**
Already behind instance admin check. Members are never instance admin. No change needed.

**Key principle:** In hosted mode, Paperclip's permission grants are the enforcement mechanism. The platform sets the right grants during provisioning. Paperclip's UI respects those grants. No additional hostedMode guards needed for role-based features — only for org management UI (invites, members, company settings) which is hidden entirely per the org integration spec.

### 5. Role Change Propagation

When a role changes on the platform, the change must propagate to Paperclip:

```
Platform: admin changes Alice from member to admin
  → platform updates organization_members role
  → platform calls POST instance:3100/internal/members/change-role
    { companyId, userId: alice.id, role: "admin" }
  → Paperclip updates membership + permission grants
  → Alice's next request gets the expanded permissions
```

No restart needed. No container recreation. Permission grants take effect immediately on the next request because `actorMiddleware` resolves memberships fresh on each request.

## Files to Create/Modify

### platform-core

| File | Action | Description |
|------|--------|-------------|
| `src/tenancy/org-service.ts` | Modify | Extract `requireAdminOrOwner()` and `requireOwner()` helpers |
| `src/tenancy/org-member-procedure.ts` | Create | `orgAdminProcedure` middleware that checks admin/owner role; extend `orgMemberProcedure` to attach `ctx.orgRole` |

### paperclip-platform

| File | Action | Description |
|------|--------|-------------|
| `src/trpc/routers/fleet.ts` | Modify | Add admin/owner role checks to mutation routes |
| `src/trpc/routers/org.ts` | Modify | Add admin/owner role checks to billing routes |

### platform-ui-core

| File | Action | Description |
|------|--------|-------------|
| `src/hooks/useMyOrgRole.ts` | Create | Hook to get current user's org role |
| `src/app/(dashboard)/settings/` | Modify | Conditionally render tabs based on role |
| Bot management components | Modify | Hide start/stop/restart controls for members |
| Update modal | Modify | Hide "Update Now" button for members |

### paperclip

| File | Action | Description |
|------|--------|-------------|
| `server/src/routes/provision.ts` | Modify | Set permission grants based on platform role in addMember/changeRole |
| `packages/shared/src/constants.ts` | Modify | Add new PERMISSION_KEYS: `agents:update`, `agents:delete`, `costs:view`, `company:delete` |

### paperclip-platform-ui

| File | Action | Description |
|------|--------|-------------|
| Settings layout | Modify | Hide billing/team/fleet tabs for members |
| Bot card | Modify | Hide controls for members, keep status/logs visible |

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Owner demoted to member | Not possible — owner must transfer ownership first |
| Last admin removed | OrgService already prevents this (countAdminsAndOwners check) |
| Admin changes own role to member | Allowed — they lose admin access immediately |
| User in multiple orgs with different roles | Roles are per-org. Switching org changes visible permissions |
| Provision call fails during role change | Platform role is updated. Paperclip permissions are stale until retry succeeds. User may have expanded/restricted access temporarily. Reconciliation job (from org spec) catches drift. |
| New permission added in future | Add to ROLE_PERMISSIONS map. Existing users get it on next role change or via reconciliation. |

## Risks

| Risk | Mitigation |
|------|------------|
| Platform and Paperclip permissions drift | Provision calls are synchronous with role changes. Reconciliation job as safety net. |
| Upstream Paperclip adds new permission-gated features | Members won't have grants for new permissions by default — safe fail-closed. Admins get grants added via ROLE_PERMISSIONS update. |
| Role check latency on every tRPC call | org member lookup is a single indexed query. Cache role in session if needed. |
| Member sees flash of admin UI before role loads | `useMyOrgRole()` returns null while loading. Show skeleton/nothing until role resolves. |

## Future Considerations

- **Viewer role:** If a read-only role is needed (common enterprise request), add `"viewer"` to the role enum with an empty `ROLE_PERMISSIONS` entry. Viewers would see status/logs/changelog but cannot create issues or projects. The three-role model is extensible to four without architectural changes.
- **Custom permission sets:** If customers need "billing admin" or "agent manager" sub-roles, extend ROLE_PERMISSIONS with custom role definitions. The infrastructure supports it — just add roles.
- **Org-level feature flags:** Some features could be gated per org tier (enterprise gets more). Orthogonal to roles but shares the same gating infrastructure.
- **Audit log:** Log all role changes and permission grant modifications for compliance.
- **Reconciliation job:** Periodic job (e.g., hourly cron) that compares platform org members + roles against Paperclip company members + permission grants, and corrects any drift from failed provision calls. Defined in the org integration spec as future work — should be implemented alongside or shortly after initial ship.
