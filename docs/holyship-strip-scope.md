# Holyship Billing/Auth/Fleet Strip Scope

**Goal:** Remove holyship's duplicate billing/auth/fleet routers and replace with platform-core client calls.

---

## 1. What to DELETE

### Entire Files
- **`platforms/holyship/src/trpc/routers/billing.ts`** (1037 lines)
  - All billing tRPC procedures (checkout, balance, history, spending limits, auto-topup)
  - Plan tier definitions (static PLAN_TIERS array)
  - Stripe integration wiring
  - Depends on: Stripe, StripePaymentProcessor, ITenantCustomerRepository, IMeterAggregator, CreditPriceMap, IAffiliateRepository, IDividendRepository, ISpendingLimitsRepository

### Partial Deletions

**`platforms/holyship/src/index.ts`** (main boot sequence):
- Lines 230-305: tRPC dependency wiring (setBillingRouterDeps, setSettingsRouterDeps, setProfileRouterDeps, setOrgRouterDeps)
  - This section creates Stripe instance, repositories, and processors
  - **KEEP:** Gateway mounting (lines 200-228), engine setup (lines 338-420), worker pool (lines 421-470)

**`platforms/holyship/src/trpc/index.ts`** (router composition):
- Line 9: `import { billingRouter } from "./routers/billing.js";`
- Line 15: `billing: billingRouter,`
- Line 30: `export { setBillingRouterDeps } from "./routers/billing.js";`
- **KEEP:** notificationTemplates, org, profile, settings routers

---

## 2. What to KEEP (Flow Engine Routes)

These are core holyship functionality, NOT duplicates:

### tRPC Routers
- **`org.ts`** — org CRUD + member management (wraps platform-core's OrgService)
- **`profile.ts`** — user profile (wraps platform-core's auth user repo)
- **`settings.ts`** — notification preferences
- **`entity.ts`** — holyship-specific: entity list/get/shipIt/status
- **`flow.ts`** — holyship-specific: flow CRUD, gate management, transition rules
- **`github.ts`** — holyship-specific: GitHub integration

### Engine Components
- **Fleet manager** (lines 421-470 in index.ts) — provisions ephemeral holyshipper containers
- **Worker pool** — processes invocations via Docker
- **Engine** (lines 338-420 in index.ts) — flow state machine, domain events
- **GitHub primitives** — primitive op handler for VCS gates

### REST Routes
- **Engine routes** (line 473-481) — `/api/claim`, `/api/report` for holyshipper containers
- **Ship It routes** (line 484-515) — GitHub issue creation
- **GitHub webhook routes** (line 518-537) — issue/PR events → entity creation
- **Flow editor/interrogation routes** (line 620-695) — flow design + design-time analysis

---

## 3. What to REPLACE (Core Client Calls)

These are sites where holyship currently calls billing/auth/fleet directly. **After deletion, call platform-core client instead:**

### In `index.ts` boot sequence:

1. **Stripe payment processor** (lines 244-272)
   - Current: Creates StripePaymentProcessor locally
   - **Replace with:** PlatformCoreClient.billing.getProcessor()

2. **Billing router deps** (lines 281-305)
   - Current: setBillingRouterDeps wires Stripe + repositories
   - **Replace with:** PlatformCoreClient will expose billing procedures via tRPC

3. **Org router deps** (lines 237-240, 294-301)
   - Current: Wires authUserRepo + creditLedger directly
   - **Replace with:** Inject via PlatformCoreClient or keep as-is (org is shared with platform-core)

4. **Settings router deps** (lines 308-312)
   - Current: DrizzleNotificationPreferencesStore from platform-core
   - **KEEP:** This is fine (already using platform-core directly)

### In `trpc/routers/org.ts`:

1. **Line 49-58: org.getOrganization()**
   - Current: Calls container.orgService (from platform-core boot)
   - **KEEP:** Already using platform-core service

2. **Line 99-145: createTeamOrganization() → billing integration**
   - Current: Calls processor.createTenantCustomer() directly
   - **Replace with:** PlatformCoreClient.billing.createCustomer()

3. **Line 146-180: inviteOrgMember() → sends email via platform-core**
   - **KEEP:** Already using platform-core email

---

## 4. Core Client SDK Requirements

The platform-core client SDK **must expose these API endpoints** (holyship will call them):

### Billing Endpoints
```typescript
// From holyship/src/trpc/routers/billing.ts procedures
billing.getCheckoutUrl(input: { amount: number; description: string; ... })
billing.getCreditsBalance(tenantId: string)
billing.getCreditsHistory(tenantId: string, limit?: number)
billing.getPaymentMethods(tenantId: string)
billing.addPaymentMethod(tenantId: string, token: string)
billing.deletePaymentMethod(tenantId: string, methodId: string)
billing.getAutoTopupSettings(tenantId: string)
billing.setAutoTopupSettings(tenantId: string, input: { ... })
billing.getSpendingLimits(tenantId: string)
billing.setSpendingLimits(tenantId: string, input: { ... })
billing.getTenantUsage(tenantId: string, period?: string)
```

### Org Endpoints
```typescript
// From holyship/src/trpc/routers/org.ts
org.getOrganization(orgId: string)
org.createOrganization(name: string, slug?: string)
org.createTeamCustomer(orgId: string)  // NEW: replaces processor.createTenantCustomer
org.updateBillingContact(orgId: string, input: { ... })
org.inviteOrgMember(orgId: string, email: string)
org.acceptOrgInvite(token: string)
```

### Fleet Endpoints (if applicable)
```typescript
fleet.provision(workerId: string, image: string)
fleet.teardown(workerId: string)
fleet.status(workerId: string)
```

---

## 5. Holyship's Own Database Schema

**YES — holyship has its own separate schema:**

Location: `platforms/holyship/src/repositories/drizzle/schema.ts`

**Tables (flow engine only, NOT billing/auth):**
- `flow_definitions` — flow metadata
- `state_definitions` — states within flows
- `gate_definitions` — condition gates
- `transition_rules` — state machine rules
- `flow_versions` — flow snapshots
- `entities` — runtime instances
- `entity_snapshots` — entity state checkpoints
- `invocations` — agent invocation records
- `transition_logs` — state machine transitions
- `domain_events` — event sourcing log
- `github_installations` — GitHub App token storage

**Schema independence:** ✅ Holyship uses `engineDb` (drizzle instance with engine schema) separate from `platformDb` (platform-core schema). No conflicts.

---

## 6. Platform-Core Direct Imports

Holyship already imports from platform-core:
- `bootPlatformServer()` — DB, migrations, org, credits, gateway
- `createTRPCContext()` — tRPC context
- `OrgService` — org management
- `IAuthUserRepository` — user lookup
- `ILedger` — credit ledger
- `IMeterAggregator` — usage metering
- `DrizzleNotificationTemplateRepository` — email templates
- `DrizzleNotificationPreferencesStore` — notification prefs
- Gateway (OpenRouter proxy)

**Breaking change risk:** ⚠️ LOW. All org/auth/settings procedures already wrap platform-core services. Removing billing just means holyship UI can't call billing procedures — but those will exist on platform-core instead.

---

## 7. What Would Break If Billing Deleted

### Immediate Breakage
1. **holyship-ui** dashboard calls `trpc.billing.*` procedures
   - **Fix:** Point UI to platform-core tRPC instead (or mount platform-core router as sub-route)

2. **holyship platform boot** calls `setBillingRouterDeps()`
   - **Fix:** Replace with platform-core client initialization

### Non-Breaking
1. **Engine** doesn't use billing router — uses metering/gateway at request time
2. **GitHub integration** independent
3. **Worker pool** independent
4. **Org management** wraps platform-core, no billing coupling

---

## 8. Migration Plan (Phased)

### Phase 1: Extract Platform-Core Client
- [ ] Create `@wopr-network/platform-core-client` SDK
- [ ] Expose billing/org/auth procedures via HTTP client wrapper
- [ ] Add service key resolution (holyship → platform-core auth)

### Phase 2: Holyship Integration
- [ ] Update `index.ts` boot to use PlatformCoreClient instead of local Stripe wiring
- [ ] Update `org.ts` router to call client for createTeamCustomer
- [ ] Delete `billing.ts` router entirely
- [ ] Remove billing router from `trpc/index.ts`

### Phase 3: holyship-ui Updates
- [ ] Replace holyship-ui tRPC calls from `holyship.billing.*` → `platform.billing.*` (or proxy)
- [ ] Verify billing dashboard still works

### Phase 4: Testing
- [ ] E2E: Holyship → platform-core billing calls
- [ ] E2E: Org creation → auto-create customer on platform-core
- [ ] E2E: Usage metering → credits debit

---

## 9. File Changes Summary

| File | Action | Lines | Details |
|------|--------|-------|---------|
| `platforms/holyship/src/trpc/routers/billing.ts` | **DELETE** | 1037 | All billing procedures |
| `platforms/holyship/src/trpc/index.ts` | **EDIT** | 3 lines | Remove billing import + export |
| `platforms/holyship/src/index.ts` | **EDIT** | ~75 lines | Remove Stripe wiring, add client init |
| `platforms/holyship/src/trpc/routers/org.ts` | **EDIT** | ~10 lines | createTeamCustomer → client call |
| `platforms/holyship/package.json` | **EDIT** | 1 line | Add `@wopr-network/platform-core-client` dep |

---

## 10. Key Assumptions & Open Questions

1. **holyship-ui deployment:** Currently mounts holyship tRPC. After billing deletion, will it proxy to platform-core for billing calls, or will holyship re-expose platform-core's billing router?
   - **Recommendation:** holyship remounts platform-core's billing router (via client) for backwards-compat with UI.

2. **Service key auth:** How does holyship authenticate to platform-core?
   - **Current state:** Uses HOLYSHIP_GATEWAY_KEY for gateway. Extend this pattern for billing client.

3. **Tenant/org mapping:** Platform-core uses tenantId. Holyship uses tenantId="default" hardcoded. Need to wire org ID mapping.
   - **Current state:** Platform-core OrgService handles multi-org. Holyship org router already wraps it.

4. **Crypto checkout:** Billing router supports both Stripe + CryptoServiceClient. Do we keep crypto in platform-core too?
   - **Current:** Yes, platform-core has CryptoServiceClient. Just delete Stripe-specific code from holyship.

---

**Prepared by:** Research phase for task #12 (holyship extraction)
**Status:** Ready for architecture review before Phase 1 implementation
