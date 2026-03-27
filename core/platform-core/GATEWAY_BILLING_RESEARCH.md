# Platform-Core Gateway Billing Flow Research

**Date:** 2026-03-17
**Researcher:** Claude Agent

## Executive Summary

The platform-core gateway implements a **double-entry ledger billing system** where credits are deducted per LLM call. Service keys bind to tenants, and billing is tenant-based. The system is mostly complete but **lacks a "platform service account" pattern** for internal WOPR services to bill against a shared account.

---

## 1. Gateway Billing Flow (Request → Credit Deduction)

### Request Path: `/v1/chat/completions`

```
1. SERVICE KEY AUTHENTICATION (middleware)
   ├─ Extract Authorization: Bearer <service_key>
   ├─ Hash the key (SHA-256)
   ├─ Query gateway_service_keys table → find tenantId
   └─ Set c.set("gatewayTenant", { id, ... })
       File: src/gateway/service-key-auth.ts:40-70

2. PROXY HANDLER (src/gateway/proxy.ts)
   ├─ Get tenant from context: c.get("gatewayTenant")
   ├─ Extract request params (model, tokens, etc.)
   └─ Resolve cost in cents via rate-lookup

3. PRE-CALL CREDIT CHECK (src/gateway/credit-gate.ts:40-85)
   ├─ Query ledger.balance(tenant.id)
   ├─ Check: balance >= estimated_cost (soft check)
   ├─ Check: balance >= grace_buffer (hard check, default -$0.50)
   └─ If insufficient: return 402 Payment Required (CreditError)

4. UPSTREAM PROXY CALL
   ├─ Forward request to provider (OpenAI, Anthropic, etc.)
   ├─ Stream response to bot
   └─ Capture actual usage (tokens, cost, etc.)

5. POST-CALL CREDIT DEBIT (src/gateway/credit-gate.ts:120-180)
   ├─ Calculate actual cost in cents (with margin, e.g., 1.3x)
   ├─ Call ledger.debit(tenantId, chargeCredit, "adapter_usage", {
   │    description: "Gateway {capability} via {provider}",
   │    allowNegative: true,
   │    attributedUserId: <optional>
   │  })
   ├─ Fire-and-forget (never fails the response)
   ├─ Emit meter event for analytics
   └─ Trigger side effects:
       ├─ onDebitComplete() → check auto-topup triggers
       ├─ onBalanceExhausted() → fire when balance crosses zero
       └─ onSpendAlertCrossed() → fire when spend threshold hit

6. RESPONSE
   └─ Return bot response (success or error from upstream)
```

**Files involved:**
- `src/gateway/service-key-auth.ts` - Bearer token extraction → tenant resolution
- `src/gateway/proxy.ts` - Main handler, orchestrates flow
- `src/gateway/credit-gate.ts` - Balance check & debit logic
- `src/gateway/rate-lookup.ts` - Cost calculation (cents)

---

## 2. Tenant & Service Key Model

### Tenant Types

```typescript
// src/db/schema/tenants.ts
type: "personal" | "org"

tenants {
  id: string (nanoid)
  name: string
  slug: string (unique)
  type: "personal" | "org"
  ownerId: string (user who created it)
  billingEmail: string
  createdAt: bigint (epoch ms)
}
```

**Current model:**
- **personal** tenant = 1:1 with user (ownerId = user.id)
- **org** tenant = multi-user organization

**Missing:** No "service account" or "platform account" type. This is the blocking gap.

### Service Key → Tenant Mapping

```typescript
// src/db/schema/gateway-service-keys.ts
gatewayServiceKeys {
  id: string
  keyHash: string (SHA-256, raw key never stored)
  tenantId: string (FK tenants.id)
  instanceId: string (one key per bot instance)
  createdAt: bigint (epoch ms)
  revokedAt: bigint | null
}
```

**Lookup flow:**
1. Extract bearer token from Authorization header
2. Hash with SHA-256
3. Query: `SELECT tenantId FROM gateway_service_keys WHERE keyHash = ?`
4. Return tenant (used for all subsequent billing)

**Key constraint:** A service key is 1:1 with a tenant. All calls using that key bill against the same tenant.

---

## 3. Double-Entry Ledger Implementation

### Schema

```typescript
// src/db/schema/ledger.ts

// Chart of Accounts (master list of accounts)
accounts {
  id: string
  code: string (unique, e.g., "1000-TENANT-LIAB")
  name: string
  type: "asset" | "liability" | "equity" | "revenue" | "expense"
  normalSide: "debit" | "credit"
  tenantId: string | null (NULL = system, per-tenant = tenant-scoped)
}

// Journal Entries (transaction headers)
journalEntries {
  id: string
  postedAt: string (ISO)
  entryType: string ("purchase", "usage", "grant", "refund", "dividend", "expiry", "correction")
  description: string
  referenceId: string (unique, dedup key)
  tenantId: string (FK tenants.id)
  metadata: jsonb ({
    funding_source?: string
    attributed_user_id?: string
    stripe_fingerprint?: string
    // ... more fields
  })
  createdBy: string ("system", "admin:<id>", "cron:expiry", etc.)
}

// Journal Lines (individual debits/credits)
journalLines {
  id: string
  journalEntryId: string (FK)
  accountId: string (FK)
  amount: bigint (nanodollars, always positive)
  side: "debit" | "credit"
}

// Materialized Cache (derived, can be reconstructed)
accountBalances {
  accountId: string (PK, FK accounts.id)
  balance: bigint (nanodollars, net balance)
  lastUpdated: string (ISO)
}
```

### Billing Transaction Example

**Event:** Gateway processes a $0.25 API call for tenant "tenant-123"

```
1. Create accounts (if not exist):
   - Asset account: "1000-TENANT-LIAB-tenant-123" (liability: decreases = debit)
   - Expense account: "5000-API-USAGE" (system, revenue type)

2. Create journal entry:
   {
     id: "je-abc123",
     entryType: "usage",
     description: "Gateway /v1/chat/completions via openai",
     referenceId: "call-xyz",
     tenantId: "tenant-123",
     metadata: {
       attributed_user_id: "user-456",
       capability: "chat",
       provider: "openai"
     },
     createdBy: "system",
     postedAt: now()
   }

3. Create two journal lines (balanced):
   [
     {
       journalEntryId: "je-abc123",
       accountId: "acct-liability",
       amount: 25000000,  // 0.25 * 1e8 nanodollars
       side: "debit"      // debit = reduce liability (tenant owes us less)
     },
     {
       journalEntryId: "je-abc123",
       accountId: "acct-api-usage",
       amount: 25000000,  // nanodollars
       side: "credit"     // credit = increase revenue
     }
   ]

4. Update account_balances atomically (same txn):
   - liability account: subtract 25000000
   - revenue account: add 25000000
```

**Balance query:**
```sql
SELECT SUM(CASE WHEN side = 'debit' THEN -amount ELSE amount END)
FROM journal_lines
WHERE accountId = 'acct-liability-tenant-123'
  AND journalEntryId IN (SELECT id FROM journal_entries WHERE tenantId = 'tenant-123')
```

---

## 4. Credit Deduction Mechanism

### ILedger Interface

```typescript
// src/monetization/credits/index.ts (re-exported from @wopr-network/platform-core/credits)
interface ILedger {
  balance(tenantId: string): Promise<Credit>
  debit(
    tenantId: string,
    amount: Credit,
    entryType: DebitType,  // "adapter_usage", "phone_cost", etc.
    options?: {
      description?: string
      allowNegative?: boolean
      attributedUserId?: string
    }
  ): Promise<void>
  // ... other methods
}

type DebitType = "adapter_usage" | "phone_cost" | "refund" | "correction" | ...
```

### Debit Flow (src/gateway/credit-gate.ts:120-180)

```typescript
// 1. Cost calculation
const chargeCredit = Credit.fromCents(Math.ceil(costUsd * 100) * margin)
// Example: $0.15 API cost × 1.3 margin = $0.195 = 19.5 cents → 20 cents

// 2. Fire debit (non-atomic with balance check — accepted trade-off)
await deps.creditLedger.debit(tenantId, chargeCredit, "adapter_usage", {
  description: `Gateway chat via openai`,
  allowNegative: true,  // Allow balance to go negative (on-account feature)
  attributedUserId: userId  // Optional: track which user triggered this
})

// 3. Side effects (fire-and-forget, don't fail response)
if (deps.onDebitComplete) {
  deps.onDebitComplete(tenantId)  // Trigger auto-topup if configured
}
if (deps.onBalanceExhausted) {
  const newBalance = await deps.creditLedger.balance(tenantId)
  const wasPositive = newBalance.add(chargeCredit).greaterThan(Credit.ZERO)
  const isNowZeroOrNegative = newBalance.isNegative() || newBalance.isZero()
  if (wasPositive && isNowZeroOrNegative) {
    deps.onBalanceExhausted(tenantId, newBalance.toCentsRounded())
  }
}
```

**Key design decisions:**
- **Fire-and-forget debits** — don't fail the API response if ledger write fails
- **allowNegative: true** — tenants can go into on-account deficit (up to grace buffer)
- **Reconciliation via ledger queries** — catch discrepancies in analytics, not in request path
- **Non-atomic with check** — concurrent requests can both pass the check, one debit may fail

---

## 5. Rate Limiting Per Tenant

### Rate Limit Table

```typescript
// src/db/schema/rate-limit-entries.ts
rateLimitEntries {
  key: string (e.g., "tenant:tenant-123:chat/v1")
  scope: string (e.g., "per_minute", "per_second")
  count: integer (current count in window)
  windowStart: bigint (epoch ms, sliding window)
}

Primary Key: (key, scope)
```

### Rate Limit Middleware

**Location:** `src/gateway/capability-rate-limit.ts`

```typescript
export interface CapabilityRateLimit {
  key: string  // tenant:X:capability
  scope: string  // per_minute, per_hour, per_day
  limit: number  // max requests per window
  window: number  // window duration in ms
}
```

**Lookup:**
1. Extract tenant from context
2. Extract capability from request (chat, tts, sms, etc.)
3. Build key: `tenant:${tenantId}:${capability}`
4. Query rate-limit-entries for (key, scope)
5. Check if count < limit within current window
6. If exceeded: return 429 Too Many Requests

---

## 6. Attribution & Tenant Isolation

### Attribution

**Current:** Implicit (service key → tenant, no per-call attribution)

**Limited support:** `attributedUserId` in debit options (optional)

```typescript
await ledger.debit(tenantId, amount, "adapter_usage", {
  attributedUserId: userId  // Stored in journal entry metadata
})
```

**What's missing:**
- No X-Tenant-Id or X-Attribute-To header support
- No concept of "billing against a different tenant than the authenticated tenant"
- No platform-level cost absorption (e.g., "bill WOPR for this call, not the bot tenant")

### Tenant Isolation

**Strong isolation:**
- Service key → single tenant (1:1 mapping)
- All downstream queries scoped to tenantId
- Rate limiting per tenant + capability
- Ledger accounts per tenant

**No cross-tenant operations:** Cannot bill one tenant on behalf of another.

---

## 7. Missing: "Platform Service Account" Pattern

### The Gap

**Scenario:** WOPR's own services (e.g., playground, demo, internal testing) need to use the gateway without:
1. Creating a user account
2. Creating a personal/org tenant
3. Paying for calls (or paying from a shared WOPR account)

**Current workaround:**
- Create a fake "system" tenant
- Manually seed with credits
- Generate a service key
- **Problem:** No billing separation, no analytics

### Proposed Solution

Add a new tenant type:

```typescript
// src/db/schema/tenants.ts
type: "personal" | "org" | "platform_service"

// Constraints:
// - ownerId: system account (e.g., "wopr-system")
// - billingEmail: null (invoiced to WOPR, not a real user)
// - tier: "internal" | "demo" | "testing" (metadata)
```

**Benefits:**
1. Separate ledger for internal WOPR usage
2. Analytics: see how much WOPR spends on its own features
3. Cost allocation: bill WOPR services proportionally to consumption
4. Audit trail: createdBy = "system", metadata tracks purpose

---

## 8. Key Files & Line Numbers

| File | Lines | Purpose |
|------|-------|---------|
| `src/gateway/service-key-auth.ts` | 40–70 | Bearer token extraction → tenant resolution |
| `src/gateway/proxy.ts` | 1–100 | Main proxy handler, orchestrates flow |
| `src/gateway/credit-gate.ts` | 40–85 | Balance check (pre-call) |
| `src/gateway/credit-gate.ts` | 120–180 | Debit logic (post-call) |
| `src/gateway/rate-lookup.ts` | 1–50 | Cost calculation in cents |
| `src/db/schema/tenants.ts` | 1–25 | Tenant table (no "platform_service" type) |
| `src/db/schema/gateway-service-keys.ts` | 1–25 | Service key → tenant mapping |
| `src/db/schema/ledger.ts` | 1–100 | Double-entry ledger (accounts, entries, lines) |
| `src/db/schema/rate-limit-entries.ts` | 1–25 | Per-tenant rate limit tracking |
| `src/monetization/credits/index.ts` | 1–40 | ILedger interface exports |

---

## 9. Summary

### ✅ Implemented

1. **Service key auth** — Bearer token → tenant lookup
2. **Proxy → credit debit flow** — Request → balance check → upstream → debit
3. **Double-entry ledger** — Full GL with journal entries, lines, account balances
4. **Rate limiting per tenant** — Separate counters per tenant + capability
5. **Graceful overages** — allowNegative flag, grace buffer ($0.50)
6. **Fire-and-forget debits** — Non-blocking, reconciliation-based

### ❌ Missing

1. **Platform service account type** — No "internal WOPR" tenant category
2. **Attribution headers** — No X-Tenant-Id, X-Attribute-To support
3. **Cross-tenant billing** — Cannot bill one tenant on behalf of another
4. **Billing metadata in responses** — No X-Credits-Charged header

### 🔧 Actionable Next Steps

1. Add `type: "platform_service"` to tenants schema + constraints
2. Seed system-owned platform service tenants at migration
3. Implement X-Credits-Charged response header for transparency
4. Add optional X-Attribute-To request header for attribution
5. Document the ledger structure for internal WOPR analytics
