# Paperclip Platform Org Integration

**Date:** 2026-03-14
**Status:** Draft
**Repos:** paperclip, paperclip-platform, paperclip-platform-ui, platform-core, platform-ui-core

## Problem

Paperclip (the bot) has a full multi-user org model: companies, memberships, invites, roles, permissions, org charts. The hosted platform layer (paperclip-platform + paperclip-platform-ui) also has an org model: tenants, organization_members, organization_invites.

Today the managed Paperclip image runs in `local_trusted` mode, which hardcodes every request as `userId: "local-board"` with instance admin privileges. There is no user identity inside the bot — everyone is the same person.

The platform is the front door: it handles auth, billing, and access. Users should manage their team exclusively through the platform. Paperclip's native invite/member UI should be hidden in hosted mode.

When a user is invited to a platform org, they should be able to use the Paperclip instance immediately — no second signup, no separate invite flow inside the bot.

## Design

### Architecture

```
Platform (front door)
  ├─ Auth (better-auth sessions)
  ├─ Org management (invite, roles, billing)
  ├─ Proxy (routes requests to Paperclip container)
  │   └─ Injects: x-platform-user-id, x-platform-user-email, x-platform-user-name
  └─ Provisioning (syncs membership changes into Paperclip)
      └─ Calls /internal/add-member, /internal/remove-member

Paperclip (the bot, hosted_proxy mode)
  ├─ actorMiddleware reads proxy headers → resolves user identity
  ├─ Company/invite/member UI hidden in hostedMode
  └─ All org management delegated to platform
```

### 1. New Deployment Mode: `hosted_proxy`

**File:** `paperclip/server/src/middleware/auth.ts`

Add a new branch in `actorMiddleware` for `hosted_proxy` deployment mode. Instead of hardcoding `local-board`, read identity from trusted proxy headers:

```typescript
if (opts.deploymentMode === "hosted_proxy") {
  const userId = req.header("x-platform-user-id");
  const userEmail = req.header("x-platform-user-email");
  const userName = req.header("x-platform-user-name");

  if (userId) {
    const [roleRow, memberships] = await Promise.all([
      db.select({ id: instanceUserRoles.id })
        .from(instanceUserRoles)
        .where(and(
          eq(instanceUserRoles.userId, userId),
          eq(instanceUserRoles.role, "instance_admin")
        ))
        .then(rows => rows[0] ?? null),
      db.select({ companyId: companyMemberships.companyId })
        .from(companyMemberships)
        .where(and(
          eq(companyMemberships.principalType, "user"),
          eq(companyMemberships.principalId, userId),
          eq(companyMemberships.status, "active"),
        )),
    ]);

    req.actor = {
      type: "board",
      userId,
      companyIds: memberships.map(r => r.companyId),
      isInstanceAdmin: Boolean(roleRow),
      source: "hosted_proxy",
    };
  } else {
    // No user header = reject (proxy should always inject)
    req.actor = { type: "none", source: "none" };
  }
}
```

**Dockerfile.managed change:** `PAPERCLIP_DEPLOYMENT_MODE=hosted_proxy` (was `local_trusted`)

**Security:** The container is never exposed to the internet. Only the platform proxy can reach it. Trusting headers from the proxy is safe — same pattern as any reverse proxy auth.

### 2. Provision Endpoints for Member Management

**File:** `paperclip/server/src/routes/provision.ts` (extend existing adapter)

The provision adapter already has `ensureUser()` and `grantAccess()`. Add new operations to the adapter interface:

**Role mapping (platform → Paperclip):**

| Platform Role | Paperclip Role | Instance Admin | Notes |
|--------------|----------------|----------------|-------|
| `owner` | `owner` | Yes | Full control |
| `admin` | `owner` | Yes | Same as owner inside Paperclip — admin distinction is platform-level (billing, org settings) |
| `member` | `member` | No | Can view/create issues, interact with agents |

**Add member:**
```typescript
async addMember(companyId: string, user: AdminUser, role: "owner" | "admin" | "member") {
  await this.ensureUser(user);
  const paperclipRole = role === "member" ? "member" : "owner";
  await access.ensureMembership(companyId, "user", user.id, paperclipRole, "active");
  if (paperclipRole === "owner") {
    await access.promoteInstanceAdmin(user.id);
  }
}
```

**Remove member:**
```typescript
async removeMember(companyId: string, userId: string) {
  // Remove company membership
  await access.removeMembership(companyId, "user", userId);
  // Demote instance admin if no longer owner of any company
  const remaining = await access.listUserCompanyAccess(userId);
  if (remaining.length === 0) {
    await access.demoteInstanceAdmin(userId);
  }
}
```

**Change role:**
```typescript
async changeRole(companyId: string, userId: string, role: "owner" | "admin" | "member") {
  const paperclipRole = role === "member" ? "member" : "owner";
  await access.ensureMembership(companyId, "user", userId, paperclipRole, "active");
  if (paperclipRole === "owner") {
    await access.promoteInstanceAdmin(userId);
  } else {
    // Demotion: remove instance admin if user is no longer owner of any company
    const remaining = await access.listUserCompanyAccess(userId);
    const isOwnerOfAny = remaining.some(c => c.role === "owner");
    if (!isOwnerOfAny) {
      await access.demoteInstanceAdmin(userId);
    }
  }
}
```

These map to new provision-server routes:
- `POST /internal/members/add` — `{ companyId, user: { id, email, name }, role }`
- `POST /internal/members/remove` — `{ companyId, userId }`
- `POST /internal/members/change-role` — `{ companyId, userId, role }`

**All provision endpoints are idempotent.** Repeated calls with the same parameters are no-ops (`ensureUser` checks for existing records, `ensureMembership` upserts).

All authenticated via `PROVISION_SECRET` bearer token (brand-agnostic; replaces the WOPR-specific `WOPR_PROVISION_SECRET` naming).

### 3. Platform Triggers Provisioning on Org Changes

**File:** `paperclip-platform/src/trpc/routers/org.ts`

When org membership changes happen in the platform, call the Paperclip instance's provision API:

**Invite accepted → add member** (triggered from `acceptInvite()` in org.ts — see Section 5):
```
Platform: user accepts org invite
  → acceptInvite() adds user to organization_members
  → acceptInvite() resolves tenant's Paperclip instance
  → POST instance:3100/internal/members/add
    { companyId: <paperclip company id>, user: { id, email, name }, role: "member" }
```

**Member removed → remove member:**
```
Platform: admin removes member from org
  → platform removes from organization_members
  → POST instance:3100/internal/members/remove
    { companyId: <paperclip company id>, userId }
```

**Role changed → change role:**
```
Platform: admin changes member role
  → platform updates organization_members
  → POST instance:3100/internal/members/change-role
    { companyId: <paperclip company id>, userId, role }
```

**Mapping:** Platform org → Paperclip company. The `companyId` is stored during initial provisioning (already returned by `createTenant()`). Platform stores this mapping in the tenant record.

### 4. Hide Company/Invite/Member UI in Hosted Mode

**File:** `paperclip/scripts/upstream-sync.mjs`

Expand the `infraKeywords` list in `scanForHostedModeGaps()` to include org management patterns:

```javascript
const infraKeywords = [
  // Existing adapter/model keywords...
  "adapterType", "AdapterType", /* ... */

  // NEW: Org management keywords (hidden in hosted mode)
  "CompanySettings",
  "CompanySwitcher",
  "InviteLanding",
  "createInvite",
  "inviteLink",
  "joinRequest",
  "companyMemberships",
  "boardClaim",
  "BoardClaim",
  "manageMembers",
  "instanceSettings",
];
```

**Specific UI changes needed in Paperclip:**

| File | Action |
|------|--------|
| `ui/src/pages/CompanySettings.tsx` | Hide invite creation, member management sections in hostedMode |
| `ui/src/components/CompanySwitcher.tsx` | Hide "Manage Companies" link, hide "Company Settings" link in hostedMode |
| `ui/src/pages/Companies.tsx` | Hide create/delete company in hostedMode (single company, platform-managed) |
| `ui/src/pages/InviteLanding.tsx` | Redirect to platform in hostedMode |
| `ui/src/pages/BoardClaim.tsx` | Redirect to platform in hostedMode |
| `ui/src/components/Layout.tsx` | Hide any "Invite" buttons in hostedMode |

**What stays visible:** The Org page (org chart, agent hierarchy) and agent management stay visible — those are product features, not org admin. Users can still see who's on the team and what agents are doing.

### 5. Platform Org Gaps to Fix

These are existing stubs/gaps in paperclip-platform that need implementation:

**`listMyOrganizations()` (org.ts):**
Currently returns empty. Implement: query `organization_members` for user's memberships, return list of orgs.

**Invite acceptance flow:**
`inviteMember()` creates the invite, but there's no `acceptInvite()` endpoint. Implement:
1. Validate token, check not expired/revoked
2. Create user account if needed (signup during accept)
3. Add to `organization_members`
4. Call Paperclip provision API to add member (triggers the flow described in Section 3)
5. Mark invite as accepted

**`listMyOrganizations()`:** Currently returns empty in org.ts. Implement by adding `listOrgsForUser(userId)` to platform-core's `OrgService`, then calling it from the tRPC route.

**Org switcher in platform UI:**
`x-tenant-id` header mechanism exists but isn't exposed in the frontend. Add org switcher component that:
- Lists user's orgs
- Switches `x-tenant-id` header for subsequent API calls
- Persists selection to localStorage

**Member list population:**
Org member list loads but doesn't populate user name/email. Join `organization_members` with user table to get display info.

### 6. Proxy Header Injection

**File:** `paperclip-platform/src/proxy/tenant-proxy.ts`

The platform proxy already routes requests to Paperclip containers. Add header injection:

```typescript
// Before proxying to the Paperclip container:
proxyReq.setHeader("x-platform-user-id", ctx.user.id);
proxyReq.setHeader("x-platform-user-email", ctx.user.email);
proxyReq.setHeader("x-platform-user-name", ctx.user.name ?? "");
```

Strip these headers from incoming external requests to prevent spoofing:
```typescript
// On incoming request, before auth:
req.headers.delete("x-platform-user-id");
req.headers.delete("x-platform-user-email");
req.headers.delete("x-platform-user-name");
```

## User Experience

### Inviting a Teammate

1. User goes to Platform → Settings → Team
2. Clicks "Invite Member"
3. Enters email, selects role (admin/member)
4. Invitee receives email with signup/accept link
5. Invitee creates platform account (or logs in if existing)
6. Platform adds them to org + provisions into Paperclip instance
7. Invitee logs in → sees the Paperclip workspace with full access

### Day-to-Day Usage

- User logs into platform
- Platform authenticates, resolves org context
- User clicks into their Paperclip instance
- Every request carries their identity via proxy headers
- Paperclip shows their issues, their agents, their activity
- Team members see the same company but actions are attributed to the right person

### What Users Never See

- Paperclip's native invite flow
- Paperclip's company management
- Paperclip's member management
- Any awareness that two systems exist

## Files to Create/Modify

### paperclip (the bot)

| File | Action | Description |
|------|--------|-------------|
| `server/src/middleware/auth.ts` | Modify | Add `hosted_proxy` deployment mode branch |
| `server/src/routes/provision.ts` | Modify | Add addMember, removeMember, changeRole to adapter |
| `Dockerfile.managed` | Modify | Change PAPERCLIP_DEPLOYMENT_MODE to hosted_proxy |
| `scripts/upstream-sync.mjs` | Modify | Expand infraKeywords for org management patterns |
| `ui/src/pages/CompanySettings.tsx` | Modify | Add hostedMode guards for invite/member sections |
| `ui/src/components/CompanySwitcher.tsx` | Modify | Hide management links in hostedMode |
| `ui/src/pages/Companies.tsx` | Modify | Hide create/delete in hostedMode |
| `ui/src/pages/InviteLanding.tsx` | Modify | Redirect to platform in hostedMode |
| `ui/src/pages/BoardClaim.tsx` | Modify | Redirect to platform in hostedMode |
| `packages/shared/src/types.ts` | Modify | Add "hosted_proxy" to DeploymentMode union |

### paperclip-platform

| File | Action | Description |
|------|--------|-------------|
| `src/trpc/routers/org.ts` | Modify | Implement listMyOrganizations, acceptInvite, wire provisioning calls |
| `src/proxy/tenant-proxy.ts` | Modify | Inject + strip x-platform-user-* headers |
| `src/fleet/provision-client.ts` | Modify | Add addMember, removeMember, changeRole methods |

### platform-ui-core

| File | Action | Description |
|------|--------|-------------|
| Org switcher component | Create | Switch between orgs, set x-tenant-id |
| Invite acceptance page | Create | Accept invite → create account → join org |
| Member list | Modify | Populate user name/email from joined query |

### platform-core

| File | Action | Description |
|------|--------|-------------|
| `src/tenancy/org-service.ts` | Modify | Add listOrgsForUser(userId), acceptInvite(token) |
| provision-server package | Modify | Add member management routes to protocol |

## Dependencies

- **Blocks:** Fleet auto-update org-level config (currently tenant-level, moves to org-level after this ships)
- **Requires:** provision-server package update for new member management routes
- **Requires:** `@paperclipai/shared` types update for `hosted_proxy` deployment mode

## Risks

| Risk | Mitigation |
|------|------------|
| Upstream adds new invite/member UI patterns | Upstream sync scanner catches them via expanded keyword list |
| Provisioning call fails when adding member | Retry with backoff. Member shows in platform but can't access Paperclip until sync succeeds. Show "provisioning" state in UI. |
| Header spoofing | Strip x-platform-user-* headers from external requests before auth. Container not exposed to internet. |
| Paperclip upstream changes auth middleware | Our `hosted_proxy` branch is isolated — rebase conflict is localized to one function |
| User removed from platform but not from Paperclip | removeMember provision call is synchronous with platform removal. If it fails, retry with backoff. Future work: add periodic reconciliation job that compares platform org members with Paperclip company members and fixes drift. |
| Company ID mapping lost | Store Paperclip companyId in tenant record during initial provisioning. Already returned by createTenant(). |

## Future Considerations

- **SSO/SAML:** Platform handles SSO, provisions users into Paperclip on first login via SAML callback
- **Fine-grained permissions:** Platform roles (owner/admin/member) map to Paperclip roles. Could extend to map to Paperclip's `principalPermissionGrants` for granular control.
- **Multi-instance orgs:** An org could have multiple Paperclip instances (staging/prod). Provisioning calls go to all instances.
- **Audit trail:** Platform logs all membership changes. Paperclip logs activity via `onProvisioned` callback. Both sides have audit coverage.
