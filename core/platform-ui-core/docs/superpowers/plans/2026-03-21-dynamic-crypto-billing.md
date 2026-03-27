# Dynamic Crypto Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make crypto billing fully dynamic end-to-end — admin adds a chain with icon on the pay server, all 4 products show it immediately with partial payment progress and confirmation tracking.

**Architecture:** Pay server exposes chain metadata (including icons) via `GET /chains`. Platform-core wraps it, wopr-platform exposes it via tRPC, platform-ui-core renders it. Webhooks fire on every confirmation until the charge is fully confirmed. UI polls chargeStatus and shows real-time progress.

**Tech Stack:** Hono (pay server), platform-core (npm), tRPC + Drizzle (wopr-platform), React 19 + Next.js 16 + shadcn + Tailwind 4 (platform-ui-core)

**Spec:** `docs/superpowers/specs/2026-03-21-dynamic-crypto-billing-design.md`

---

## File Map

### Pay Server (platform-core, deployed on pay.wopr.bot)

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `packages/platform-core/src/billing/crypto/schema.ts` | Add `icon_url`, `display_order` columns to `chains` table |
| Modify | `packages/platform-core/src/billing/crypto/routes.ts` | Return `iconUrl`, `displayOrder` from `GET /chains`; accept in `POST/PUT /admin/chains` |
| Modify | `packages/platform-core/src/billing/crypto/watcher.ts` | Fire intermediate confirmation webhooks (not just final) |
| Create | `packages/platform-core/src/billing/crypto/__tests__/icon-fields.test.ts` | Test icon_url and display_order round-trip |

### Platform-Core (npm package)

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `packages/platform-core/src/billing/crypto/client.ts` | Add `iconUrl`, `displayOrder` to `ChainInfo` type and `listChains()` mapping |
| Modify | `packages/platform-core/src/billing/crypto/key-server-webhook.ts` | Accept new webhook fields, normalize old status values, update charge progress |
| Modify | `packages/platform-core/src/billing/crypto/charge-store.ts` | Expand `ICryptoChargeRepository` interface with `updateProgress`, `get`, new fields |
| Modify | `packages/platform-core/src/billing/crypto/unified-checkout.ts` | Remove hardcoded xpub deps, delegate to `CryptoServiceClient.createCharge()` |
| Create | `packages/platform-core/src/billing/crypto/__tests__/webhook-confirmations.test.ts` | Test intermediate confirmation handling, partial payments, status normalization |
| Create | `packages/platform-core/src/billing/crypto/__tests__/charge-status.test.ts` | Test charge progress updates and get query |

### wopr-platform (backend API)

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `/home/tsavo/wopr-platform/src/trpc/routers/billing.ts` | Implement `supportedPaymentMethods`, `chargeStatus`, rename `cryptoCheckout` → `checkout` with chain param |
| Modify | `/home/tsavo/wopr-platform/src/api/routes/billing.ts` | Fix `chain: "btc"` hardcode, deprecate REST checkout |
| Modify | `/home/tsavo/wopr-platform/src/index.ts` | Update `CryptoServiceClient` wiring if needed |
| Create | `/home/tsavo/wopr-platform/drizzle/NNNN_crypto_charge_progress.sql` | Migration: add `chain`, `amount_received_cents`, `confirmations`, `confirmations_required`, `tx_hash` to `crypto_charges` |
| Modify | `/home/tsavo/wopr-platform/src/api/routes/billing.test.ts` | Update tests for new checkout/webhook behavior |

### platform-ui-core (shared UI)

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `/home/tsavo/platform-ui-core/src/lib/api.ts` | Update `SupportedPaymentMethod`, `ChargeStatusResult`, `createCheckout` signature |
| Modify | `/home/tsavo/platform-ui-core/src/lib/trpc-types.ts` | Verify type stubs match new tRPC procedures |
| Modify | `/home/tsavo/platform-ui-core/src/components/billing/buy-crypto-credits-panel.tsx` | Icons, partial payment UI, confirmation progress, expiry handling |
| Modify | `/home/tsavo/platform-ui-core/src/app/admin/payment-methods/page.tsx` | Add `iconUrl` and `displayOrder` fields to admin form |
| Modify | `/home/tsavo/platform-ui-core/src/__tests__/buy-crypto-credits-panel.test.tsx` | Test partial payment states, confirmation progress, icon rendering, expiry |

### Product UIs (version bumps)

| Action | File | Change |
|--------|------|--------|
| Modify | `/home/tsavo/wopr-platform-ui/package.json` | Bump platform-ui-core |
| Modify | `/home/tsavo/paperclip-platform-ui/package.json` | Bump platform-ui-core |
| Modify | `/home/tsavo/nemoclaw-platform-ui/package.json` | Bump platform-ui-core |
| Modify | `/home/tsavo/holyship-ui/package.json` | Add platform-ui-core dependency, wire billing page |

---

## Task 1: Pay Server — Add `icon_url` and `display_order` to chains

**Files:**
- Modify: `packages/platform-core/src/billing/crypto/schema.ts`
- Modify: `packages/platform-core/src/billing/crypto/routes.ts`
- Create: `packages/platform-core/src/billing/crypto/__tests__/icon-fields.test.ts`

**Context:** The pay server runs platform-core on pay.wopr.bot. The `chains` table schema and Hono routes live in platform-core's billing/crypto module. Find the exact schema by grepping for `chains` table definition in the billing/crypto directory.

- [ ] **Step 1: Write failing test for icon_url in GET /chains response**

```typescript
// __tests__/icon-fields.test.ts
import { describe, expect, it } from "vitest";

describe("GET /chains icon and display_order fields", () => {
  it("returns iconUrl and displayOrder for each chain", async () => {
    // Setup: insert a chain with icon_url and display_order
    // Call GET /chains
    // Assert each entry has iconUrl: string and displayOrder: number
  });

  it("filters out chains with empty icon_url", async () => {
    // Setup: insert chain with icon_url = ''
    // Call GET /chains
    // Assert chain is NOT in response
  });
});
```

Adapt to the actual test patterns used in the billing/crypto test directory.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/platform-core/src/billing/crypto/__tests__/icon-fields.test.ts`
Expected: FAIL — `iconUrl` not in response, no filtering

- [ ] **Step 3: Add columns to schema**

In the chains table definition, add:
```sql
icon_url TEXT NOT NULL DEFAULT '',
display_order INTEGER NOT NULL DEFAULT 0
```

If using Drizzle, add the columns to the schema object. Generate migration.

- [ ] **Step 4: Update GET /chains to return new fields and filter**

In the route handler for `GET /chains`, add `iconUrl` and `displayOrder` to the response mapping. Add `WHERE icon_url != ''` filter (or `.where(ne(chains.iconUrl, ''))` in Drizzle).

- [ ] **Step 5: Update POST/PUT /admin/chains to accept new fields**

Accept `iconUrl: string` and `displayOrder: number` in the admin chain registration/update endpoints.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run packages/platform-core/src/billing/crypto/__tests__/icon-fields.test.ts`
Expected: PASS

- [ ] **Step 7: Backfill existing chains**

Write a migration or seed script to set `icon_url` for existing chains (BTC, DOGE, LTC, Base tokens). Use publicly available SVG icon URLs. Set `display_order` values.

- [ ] **Step 8: Commit**

```bash
git add -p  # stage schema, routes, tests, migration
git commit -m "feat(crypto): add icon_url and display_order to chains table and API"
```

---

## Task 2: Platform-Core — Update `ChainInfo` type and `listChains()`

**Files:**
- Modify: `packages/platform-core/src/billing/crypto/client.ts`

- [ ] **Step 1: Add `iconUrl` and `displayOrder` to `ChainInfo` interface**

```typescript
export interface ChainInfo {
  id: string;
  token: string;
  chain: string;
  decimals: number;
  displayName: string;
  contractAddress: string | null;
  confirmations: number;
  iconUrl: string;       // NEW
  displayOrder: number;  // NEW
}
```

- [ ] **Step 2: Update `listChains()` response mapping**

Map `icon_url` → `iconUrl` and `display_order` → `displayOrder` from the pay server response.

- [ ] **Step 3: Run existing client tests**

Run: `npx vitest run packages/platform-core/src/billing/crypto/__tests__/client.test.ts`
Expected: PASS (may need to update test fixtures to include new fields)

- [ ] **Step 4: Commit**

```bash
git add packages/platform-core/src/billing/crypto/client.ts
git commit -m "feat(crypto): add iconUrl and displayOrder to ChainInfo type"
```

---

## Task 3: Platform-Core — Expand `ICryptoChargeRepository` for partial payments

**Files:**
- Modify: `packages/platform-core/src/billing/crypto/charge-store.ts`
- Create: `packages/platform-core/src/billing/crypto/__tests__/charge-status.test.ts`

- [ ] **Step 1: Write failing test for charge progress tracking**

```typescript
describe("ICryptoChargeRepository progress tracking", () => {
  it("creates charge with chain and expected amount", async () => {
    await store.create("ch_1", "tenant_1", 5000, "btc");
    const charge = await store.get("ch_1");
    expect(charge.chain).toBe("btc");
    expect(charge.amountExpectedCents).toBe(5000);
    expect(charge.amountReceivedCents).toBe(0);
    expect(charge.status).toBe("pending");
  });

  it("updates progress on partial payment", async () => {
    await store.create("ch_1", "tenant_1", 5000, "btc");
    await store.updateProgress("ch_1", {
      status: "partial",
      amountReceivedCents: 2500,
      confirmations: 0,
      confirmationsRequired: 6,
    });
    const charge = await store.get("ch_1");
    expect(charge.status).toBe("partial");
    expect(charge.amountReceivedCents).toBe(2500);
  });

  it("updates confirmations on each webhook", async () => {
    await store.create("ch_1", "tenant_1", 5000, "btc");
    await store.updateProgress("ch_1", {
      status: "partial",
      amountReceivedCents: 5000,
      confirmations: 3,
      confirmationsRequired: 6,
      txHash: "abc123",
    });
    const charge = await store.get("ch_1");
    expect(charge.confirmations).toBe(3);
    expect(charge.txHash).toBe("abc123");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/platform-core/src/billing/crypto/__tests__/charge-status.test.ts`
Expected: FAIL — `create` doesn't accept `chain`, `updateProgress` doesn't exist, `get` doesn't exist

- [ ] **Step 3: Update `ICryptoChargeRepository` interface**

```typescript
export type CryptoChargeStatus = "pending" | "partial" | "confirmed" | "expired" | "failed";

export interface CryptoCharge {
  id: string;
  tenantId: string;
  chain: string;
  status: CryptoChargeStatus;
  amountExpectedCents: number;
  amountReceivedCents: number;
  confirmations: number;
  confirmationsRequired: number;
  txHash?: string;
  credited: boolean;
  createdAt: Date;
}

export interface ICryptoChargeRepository {
  create(referenceId: string, tenantId: string, amountExpectedCents: number, chain: string): Promise<void>;
  updateProgress(referenceId: string, update: {
    status: CryptoChargeStatus;
    amountReceivedCents: number;
    confirmations: number;
    confirmationsRequired: number;
    txHash?: string;
  }): Promise<void>;
  markCredited(referenceId: string): Promise<void>;
  get(referenceId: string): Promise<CryptoCharge>;
}
```

Keep the old `updateStatus` method as a deprecated pass-through for one release cycle.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/platform-core/src/billing/crypto/__tests__/charge-status.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/platform-core/src/billing/crypto/charge-store.ts
git add packages/platform-core/src/billing/crypto/__tests__/charge-status.test.ts
git commit -m "feat(crypto): expand ICryptoChargeRepository with partial payment progress tracking"
```

---

## Task 4: Platform-Core — Update webhook handler for confirmation tracking

**Files:**
- Modify: `packages/platform-core/src/billing/crypto/key-server-webhook.ts`
- Create: `packages/platform-core/src/billing/crypto/__tests__/webhook-confirmations.test.ts`

- [ ] **Step 1: Write failing test for intermediate confirmation webhooks**

```typescript
describe("handleKeyServerWebhook confirmation tracking", () => {
  it("updates progress on partial payment webhook", async () => {
    // Create charge
    // Fire webhook with status: "partial", amountReceivedCents: 2500, confirmations: 0
    // Assert chargeStore.updateProgress called with partial data
    // Assert ledger NOT credited
  });

  it("updates confirmations on each intermediate webhook", async () => {
    // Fire webhook with confirmations: 3, confirmationsRequired: 6
    // Assert chargeStore.updateProgress called with confirmations: 3
    // Assert ledger NOT credited (not yet at threshold)
  });

  it("credits ledger only on confirmed status", async () => {
    // Fire webhook with status: "confirmed", confirmations: 6, confirmationsRequired: 6
    // Assert chargeStore.updateProgress called
    // Assert chargeStore.markCredited called
    // Assert ledger.credit called with correct cents amount
  });

  it("normalizes old status values", async () => {
    // Fire webhook with status: "Settled" (old format)
    // Assert treated as "confirmed"
    // Fire webhook with status: "Processing"
    // Assert treated as "partial"
  });

  it("keeps amountUsdCents as deprecated alias for amountExpectedCents", async () => {
    // Fire webhook with amountUsdCents but no amountExpectedCents
    // Assert amountExpectedCents derived from amountUsdCents
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/platform-core/src/billing/crypto/__tests__/webhook-confirmations.test.ts`
Expected: FAIL

- [ ] **Step 3: Update `CryptoWebhookPayload` type**

```typescript
export interface CryptoWebhookPayload {
  chargeId: string;
  chain: string;
  address: string;
  status: string; // accept any string, normalize internally
  amountExpectedCents?: number;
  amountReceivedCents?: number;
  amountUsdCents?: number;       // DEPRECATED — alias for amountExpectedCents
  amountReceived?: string;       // DEPRECATED — ignored
  txHash?: string;
  confirmations?: number;
  confirmationsRequired?: number;
}
```

- [ ] **Step 4: Implement status normalization and progress tracking in handler**

In `handleKeyServerWebhook`:

```typescript
// Normalize status
function normalizeStatus(raw: string): CryptoChargeStatus {
  switch (raw) {
    case "Settled": return "confirmed";
    case "Processing": return "partial";
    case "pending": case "partial": case "confirmed": case "expired": case "failed":
      return raw;
    default: return "pending";
  }
}

// On every webhook (not just terminal):
await chargeStore.updateProgress(payload.chargeId, {
  status: normalizeStatus(payload.status),
  amountReceivedCents: payload.amountReceivedCents ?? 0,
  confirmations: payload.confirmations ?? 0,
  confirmationsRequired: payload.confirmationsRequired ?? 0,
  txHash: payload.txHash,
});

// Credit ledger ONLY on confirmed
if (normalizeStatus(payload.status) === "confirmed") {
  const expectedCents = payload.amountExpectedCents ?? payload.amountUsdCents ?? 0;
  await ledger.credit(tenantId, Credit.fromCents(expectedCents), "purchase", {
    referenceId: payload.chargeId,
    fundingSource: "crypto",
  });
  await chargeStore.markCredited(payload.chargeId);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run packages/platform-core/src/billing/crypto/__tests__/webhook-confirmations.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/platform-core/src/billing/crypto/key-server-webhook.ts
git add packages/platform-core/src/billing/crypto/__tests__/webhook-confirmations.test.ts
git commit -m "feat(crypto): track intermediate confirmations, normalize webhook statuses"
```

---

## Task 5: Platform-Core — Simplify `UnifiedCheckoutDeps`

**Files:**
- Modify: `packages/platform-core/src/billing/crypto/unified-checkout.ts`

- [ ] **Step 1: Replace hardcoded xpub deps with CryptoServiceClient delegation**

The pay server handles xpub management and address derivation. Remove `evmXpub`, `btcXpub`, `utxoNetwork` from `UnifiedCheckoutDeps`. Checkout just calls `CryptoServiceClient.createCharge(chain, amountUsd)`.

```typescript
export interface UnifiedCheckoutDeps {
  chargeStore: ICryptoChargeRepository;
  oracle: IPriceOracle;
  cryptoClient: CryptoServiceClient;
}

export async function createUnifiedCheckout(
  deps: UnifiedCheckoutDeps,
  input: { chain: string; amountUsd: number; tenantId: string },
) {
  const result = await deps.cryptoClient.createCharge({
    chain: input.chain,
    amountUsd: input.amountUsd,
    metadata: { tenant: input.tenantId },
  });
  await deps.chargeStore.create(
    result.chargeId,
    input.tenantId,
    Math.round(input.amountUsd * 100),
    input.chain,
  );
  return result;
}
```

- [ ] **Step 2: Update existing tests**

Update any tests that construct `UnifiedCheckoutDeps` with the old shape. Replace `evmXpub`/`btcXpub` with a mocked `CryptoServiceClient`.

- [ ] **Step 3: Run tests**

Run: `npx vitest run packages/platform-core/src/billing/crypto/`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/platform-core/src/billing/crypto/unified-checkout.ts
git commit -m "refactor(crypto): delegate checkout to CryptoServiceClient, remove hardcoded xpub deps"
```

---

## Task 6: Platform-Core — Update pay server watcher for intermediate webhooks

**Files:**
- Modify: `packages/platform-core/src/billing/crypto/watcher.ts` (or equivalent BTC/EVM watcher files)
- Create: `packages/platform-core/src/billing/crypto/__tests__/watcher-confirmations.test.ts`

- [ ] **Step 1: Identify the watcher code**

Grep for `listsinceblock`, `eth_getLogs`, `confirmations`, `callbackUrl` in `packages/platform-core/src/billing/crypto/`. The BTC watcher polls bitcoind; the EVM watcher polls RPC logs.

- [ ] **Step 2: Write failing test for per-block webhook emission**

```typescript
describe("BTC watcher intermediate confirmations", () => {
  it("fires webhook on first tx detection with confirmations: 0", async () => {
    // Mock bitcoind returning a new tx with 0 confirmations
    // Assert webhook fired with status: "partial", confirmations: 0, confirmationsRequired: 6
  });

  it("fires webhook on each new confirmation", async () => {
    // Mock bitcoind returning tx with confirmations: 3
    // Assert webhook fired with status: "partial", confirmations: 3
  });

  it("fires final webhook with status confirmed at threshold", async () => {
    // Mock bitcoind returning tx with confirmations: 6 (= required)
    // Assert webhook fired with status: "confirmed", confirmations: 6
  });

  it("uses canonical status values, not legacy Settled/Processing", async () => {
    // Assert outbound webhooks use "pending", "partial", "confirmed" — never "Settled", "Processing"
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run packages/platform-core/src/billing/crypto/__tests__/watcher-confirmations.test.ts`
Expected: FAIL

- [ ] **Step 4: Update BTC watcher to fire webhooks per confirmation with canonical status values**

Currently the watcher likely fires one webhook when a tx is first detected and one when confirmations reach the threshold. Change it to:

1. Tx first seen → fire webhook: `status: "partial"`, `confirmations: 0`
2. Each new block → fire webhook: `status: "partial"`, `confirmations: N`
3. Confirmations reach threshold → fire webhook: `status: "confirmed"`, `confirmations: N`

**Critical:** Use the canonical status enum values (`"pending"`, `"partial"`, `"confirmed"`, `"expired"`, `"failed"`) — NOT the legacy `"Settled"` or `"Processing"` strings. The normalization in `handleKeyServerWebhook` (Task 4) is a safety net for old payloads, not an excuse to keep emitting old values.

Include `amountExpectedCents`, `amountReceivedCents`, `confirmationsRequired` in every webhook payload.

- [ ] **Step 5: Apply same pattern to EVM watcher**

Same 3-phase webhook pattern for EVM (Base/Arbitrum) chains. Same canonical status values.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run packages/platform-core/src/billing/crypto/__tests__/watcher-confirmations.test.ts`
Expected: PASS

- [ ] **Step 7: Run full watcher test suite**

Run: `npx vitest run packages/platform-core/src/billing/crypto/`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add packages/platform-core/src/billing/crypto/
git commit -m "feat(crypto): fire intermediate confirmation webhooks until charge confirmed"
```

---

## Task 7: Platform-Core — Publish

- [ ] **Step 1: Run full platform-core test suite**

Run the platform-core CI gate (lint, build, test). All must pass.

- [ ] **Step 2: PR, merge, CI publishes**

Create PR with all platform-core changes from Tasks 1-6. Merge triggers CI npm publish of new platform-core version.

- [ ] **Step 3: Note the published version number**

Record it — wopr-platform and product UIs will bump to this version.

---

## Task 8: wopr-platform — Drizzle migration for `crypto_charges`

**Files:**
- Create: `/home/tsavo/wopr-platform/drizzle/NNNN_crypto_charge_progress.sql`

- [ ] **Step 1: Generate Drizzle migration**

```sql
ALTER TABLE crypto_charges ADD COLUMN chain TEXT NOT NULL DEFAULT '';
ALTER TABLE crypto_charges ADD COLUMN amount_received_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE crypto_charges ADD COLUMN confirmations INTEGER NOT NULL DEFAULT 0;
ALTER TABLE crypto_charges ADD COLUMN confirmations_required INTEGER NOT NULL DEFAULT 0;
ALTER TABLE crypto_charges ADD COLUMN tx_hash TEXT;
```

Run: `npx drizzle-kit generate` to create the migration file. Remember: multiple statements need `--> statement-breakpoint` separators for PGlite tests.

- [ ] **Step 2: Run migration locally**

Run: `npx drizzle-kit push` or equivalent local migration command.
Expected: Schema updated successfully.

- [ ] **Step 3: Commit**

```bash
git add drizzle/
git commit -m "feat(db): add partial payment progress columns to crypto_charges"
```

---

## Task 9: wopr-platform — Bump platform-core and implement charge store

**Files:**
- Modify: `/home/tsavo/wopr-platform/package.json`
- Modify: The file implementing `ICryptoChargeRepository` (find via `grep -r "ICryptoChargeRepository" src/`)

- [ ] **Step 1: Bump platform-core version**

```bash
cd ~/wopr-platform
pnpm add @wopr-network/platform-core@<new-version>
```

- [ ] **Step 2: Fix build — implement new `ICryptoChargeRepository` methods**

The new interface requires `create(ref, tenant, cents, chain)`, `updateProgress(ref, update)`, and `get(ref)`. Implement against the Drizzle schema with the new columns.

- [ ] **Step 3: Run build**

Run: `pnpm build`
Expected: PASS — no type errors

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/` (targeted, not full suite — avoid OOM)
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml src/
git commit -m "feat(billing): implement expanded ICryptoChargeRepository with progress tracking"
```

---

## Task 10: wopr-platform — Implement tRPC billing procedures

**Files:**
- Modify: `/home/tsavo/wopr-platform/src/trpc/routers/billing.ts`
- Modify: `/home/tsavo/wopr-platform/src/api/routes/billing.ts`
- Modify: `/home/tsavo/wopr-platform/src/api/routes/billing.test.ts`

- [ ] **Step 1: Write failing test for `supportedPaymentMethods` tRPC query**

```typescript
describe("billing.supportedPaymentMethods", () => {
  it("returns chains with iconUrl and displayOrder", async () => {
    // Mock CryptoServiceClient.listChains() to return test data
    // Call tRPC query
    // Assert response includes iconUrl and displayOrder
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL — procedure doesn't exist

- [ ] **Step 3: Implement `supportedPaymentMethods` query**

```typescript
supportedPaymentMethods: publicProcedure.query(async () => {
  const client = getCryptoClient();
  return client.listChains();
}),
```

- [ ] **Step 4: Run test to verify it passes**

Expected: PASS

- [ ] **Step 5: Write failing test for `chargeStatus` tRPC query**

```typescript
describe("billing.chargeStatus", () => {
  it("returns charge with partial payment progress", async () => {
    // Setup: create charge, update progress
    // Query chargeStatus
    // Assert amountReceivedCents, confirmations, confirmationsRequired present
  });
});
```

- [ ] **Step 6: Implement `chargeStatus` query**

```typescript
chargeStatus: authedProcedure
  .input(z.object({ referenceId: z.string() }))
  .query(async ({ input }) => {
    const charge = await chargeStore.get(input.referenceId);
    return {
      chargeId: charge.id,
      status: charge.status,
      amountExpectedCents: charge.amountExpectedCents,
      amountReceivedCents: charge.amountReceivedCents,
      confirmations: charge.confirmations,
      confirmationsRequired: charge.confirmationsRequired,
      txHash: charge.txHash,
      credited: charge.credited,
    };
  }),
```

- [ ] **Step 7: Rename `cryptoCheckout` → `checkout`, accept `chain` param**

Delete the old `cryptoCheckout` procedure. Add:

```typescript
checkout: authedProcedure
  .input(z.object({
    chain: z.string().min(1),
    amountUsd: z.number().positive(),
  }))
  .mutation(async ({ input, ctx }) => {
    const client = getCryptoClient();
    const result = await client.createCharge({
      chain: input.chain,
      amountUsd: input.amountUsd,
      metadata: { tenant: ctx.tenant },
    });
    await chargeStore.create(result.chargeId, ctx.tenant, Math.round(input.amountUsd * 100), input.chain);
    return {
      chargeId: result.chargeId,
      address: result.address,
      referenceId: result.chargeId,
      displayAmount: result.displayAmount,
      token: result.token,
      chain: result.chain,
      priceCents: result.priceCents,
    };
  }),
```

- [ ] **Step 8: Fix REST route — remove `chain: "btc"` hardcode**

In `/home/tsavo/wopr-platform/src/api/routes/billing.ts`, change the `POST /billing/crypto/checkout` handler to read `chain` from the request body instead of hardcoding `"btc"`. Add deprecation log.

- [ ] **Step 9: Update webhook handler to call `updateProgress` on every webhook**

In the `POST /billing/crypto/webhook` handler, ensure `handleKeyServerWebhook` is called with the new payload shape. Every webhook updates the charge store, not just terminal ones.

- [ ] **Step 10: Run full billing test suite**

Run: `npx vitest run src/api/routes/billing.test.ts src/trpc/routers/billing.test.ts`
Expected: PASS

- [ ] **Step 11: Run CI gate**

Run: `pnpm lint && pnpm format && pnpm build && pnpm test` (or the project's specific gate)
Expected: All pass

- [ ] **Step 12: Commit**

```bash
git add src/trpc/routers/billing.ts src/api/routes/billing.ts src/api/routes/billing.test.ts
git commit -m "feat(billing): implement tRPC crypto procedures, fix chain hardcode, add confirmation tracking"
```

---

## Task 11: wopr-platform — PR and deploy

- [ ] **Step 1: Create PR with Tasks 8-10**

All wopr-platform changes in one PR: migration + charge store + tRPC procedures + webhook handler.

- [ ] **Step 2: Merge and deploy**

Merge triggers CI. Deploy to production.

---

## Task 12: platform-ui-core — Update types and `createCheckout` signature

**Files:**
- Modify: `/home/tsavo/platform-ui-core/src/lib/api.ts`
- Modify: `/home/tsavo/platform-ui-core/src/lib/trpc-types.ts`

- [ ] **Step 1: Update `SupportedPaymentMethod` type**

In `api.ts`, add `iconUrl`:

```typescript
export interface SupportedPaymentMethod {
  id: string;
  type: string;
  token: string;
  chain: string;
  displayName: string;
  decimals: number;
  displayOrder: number;
  iconUrl: string;  // NEW
}
```

- [ ] **Step 2: Update `ChargeStatusResult` type**

```typescript
export interface ChargeStatusResult {
  chargeId: string;
  status: "pending" | "partial" | "confirmed" | "expired" | "failed";
  amountExpectedCents: number;
  amountReceivedCents: number;
  confirmations: number;
  confirmationsRequired: number;
  txHash?: string;
  credited: boolean;
  /** @deprecated Use amountExpectedCents. Removed next major. */
  amountUsdCents: number;
}
```

The `amountUsdCents` field is kept as a deprecated alias for `amountExpectedCents` for one release cycle, matching the webhook deprecation strategy. The tRPC `chargeStatus` query returns both fields with the same value.

- [ ] **Step 3: Update `createCheckout` signature**

Change from `createCheckout(methodId, amountUsd)` to `createCheckout(chain, amountUsd)`:

```typescript
export async function createCheckout(chain: string, amountUsd: number): Promise<CheckoutResult> {
  return trpcVanilla.billing.checkout.mutate({ chain, amountUsd });
}
```

- [ ] **Step 4: Verify trpc-types.ts stubs still match**

The stubs should already have `checkout`, `chargeStatus`, `supportedPaymentMethods`. Confirm no changes needed.

- [ ] **Step 5: Run check**

Run: `npm run check` (biome + tsc)
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/api.ts src/lib/trpc-types.ts
git commit -m "feat(billing): update types for dynamic crypto with icons and partial payments"
```

---

## Task 13: platform-ui-core — Update crypto panel with icons, partials, confirmations

**Files:**
- Modify: `/home/tsavo/platform-ui-core/src/components/billing/buy-crypto-credits-panel.tsx`
- Modify: `/home/tsavo/platform-ui-core/src/__tests__/buy-crypto-credits-panel.test.tsx`

- [ ] **Step 1: Write failing test for icon rendering**

```typescript
it("renders coin icons from iconUrl", async () => {
  mockGetSupportedPaymentMethods.mockResolvedValue([
    { id: "1", type: "crypto", token: "BTC", chain: "btc", displayName: "Bitcoin",
      decimals: 8, displayOrder: 0, iconUrl: "https://cdn.example.com/btc.svg" },
  ]);
  render(<BuyCryptoCreditPanel />);
  await waitFor(() => {
    const img = screen.getByAltText("BTC");
    expect(img).toHaveAttribute("src", "https://cdn.example.com/btc.svg");
  });
});
```

- [ ] **Step 2: Write failing test for partial payment display**

```typescript
it("shows partial payment progress", async () => {
  // Setup: checkout created, mock chargeStatus returning partial
  mockGetChargeStatus.mockResolvedValue({
    chargeId: "ch_1",
    status: "partial",
    amountExpectedCents: 5000,
    amountReceivedCents: 2500,
    confirmations: 0,
    confirmationsRequired: 6,
    credited: false,
  });
  // Assert UI shows "Received $25.00 of $50.00"
});
```

- [ ] **Step 3: Write failing test for confirmation progress**

```typescript
it("shows confirmation count", async () => {
  mockGetChargeStatus.mockResolvedValue({
    chargeId: "ch_1",
    status: "partial",
    amountExpectedCents: 5000,
    amountReceivedCents: 5000,
    confirmations: 3,
    confirmationsRequired: 6,
    credited: false,
  });
  // Assert UI shows "Confirming (3 of 6)"
});
```

- [ ] **Step 4: Write failing test for expiry handling**

```typescript
it("shows expiry message and try again button", async () => {
  mockGetChargeStatus.mockResolvedValue({
    chargeId: "ch_1",
    status: "expired",
    amountExpectedCents: 5000,
    amountReceivedCents: 0,
    confirmations: 0,
    confirmationsRequired: 6,
    credited: false,
  });
  // Assert "Payment expired" text
  // Assert "Try Again" button visible
});
```

- [ ] **Step 5: Run tests to verify they all fail**

Run: `npx vitest run src/__tests__/buy-crypto-credits-panel.test.tsx`
Expected: FAIL

- [ ] **Step 6: Update coin selector with icons**

```tsx
{methods.map((m) => (
  <button
    key={m.id}
    type="button"
    onClick={() => { setSelectedMethod(m); handleReset(); }}
    className={cn(
      "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
      selectedMethod?.id === m.id
        ? "bg-primary/10 text-primary"
        : "text-muted-foreground hover:text-foreground",
    )}
  >
    <img
      src={m.iconUrl}
      alt={m.token}
      className="h-4 w-4"
      loading="lazy"
      onError={(e) => { e.currentTarget.style.display = "none"; }}
    />
    {m.token}
  </button>
))}
```

- [ ] **Step 7: Update poll loop for rich status model**

Replace the binary state machine with:

```typescript
useEffect(() => {
  if (!checkout?.referenceId) {
    setPaymentStatus(null);
    return;
  }
  setPaymentStatus({ status: "waiting", amountExpectedCents: 0, amountReceivedCents: 0, confirmations: 0, confirmationsRequired: 0 });

  const interval = setInterval(async () => {
    try {
      const s = await getChargeStatus(checkout.referenceId);
      if (s.credited) {
        setPaymentStatus({ ...s, status: "credited" } as PaymentProgress);
        clearInterval(interval);
      } else if (s.status === "expired" || s.status === "failed") {
        setPaymentStatus(s as PaymentProgress);
        clearInterval(interval);
      } else {
        setPaymentStatus({
          status: s.amountReceivedCents > 0 && s.amountReceivedCents >= s.amountExpectedCents
            ? "confirming" : s.amountReceivedCents > 0 ? "partial" : "waiting",
          amountExpectedCents: s.amountExpectedCents,
          amountReceivedCents: s.amountReceivedCents,
          confirmations: s.confirmations,
          confirmationsRequired: s.confirmationsRequired,
        });
      }
    } catch {
      // Ignore poll errors
    }
  }, 5000);
  return () => clearInterval(interval);
}, [checkout?.referenceId]);
```

- [ ] **Step 8: Render partial payment and confirmation UI**

```tsx
{paymentStatus?.status === "waiting" && (
  <p className="text-xs text-yellow-500 animate-pulse">Waiting for payment...</p>
)}
{paymentStatus?.status === "partial" && (
  <p className="text-xs text-blue-500">
    Received ${(paymentStatus.amountReceivedCents / 100).toFixed(2)} of $
    {(paymentStatus.amountExpectedCents / 100).toFixed(2)} — send $
    {((paymentStatus.amountExpectedCents - paymentStatus.amountReceivedCents) / 100).toFixed(2)} more
  </p>
)}
{paymentStatus?.status === "confirming" && (
  <p className="text-xs text-blue-500">
    Payment received. Confirming ({paymentStatus.confirmations} of {paymentStatus.confirmationsRequired})...
  </p>
)}
{paymentStatus?.status === "credited" && (
  <p className="text-xs text-green-500 font-medium">
    Payment confirmed! Credits added to your account.
  </p>
)}
{paymentStatus?.status === "expired" && (
  <p className="text-xs text-red-500">Payment expired.</p>
)}
{paymentStatus?.status === "failed" && (
  <p className="text-xs text-red-500">Payment failed.</p>
)}
```

- [ ] **Step 9: Update `createCheckout` call site**

```typescript
const result = await createCheckout(selectedMethod.chain, selectedAmount);
```

- [ ] **Step 10: Add Try Again button for expired/failed**

```tsx
{(paymentStatus?.status === "expired" || paymentStatus?.status === "failed") && (
  <Button variant="outline" size="sm" onClick={handleReset}>
    Try Again
  </Button>
)}
```

- [ ] **Step 11: Run tests**

Run: `npx vitest run src/__tests__/buy-crypto-credits-panel.test.tsx`
Expected: PASS

- [ ] **Step 12: Run full check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 13: Commit**

```bash
git add src/components/billing/buy-crypto-credits-panel.tsx src/__tests__/buy-crypto-credits-panel.test.tsx
git commit -m "feat(billing): icons, partial payment progress, confirmation tracking in crypto panel"
```

---

## Task 14: platform-ui-core — Update admin payment methods page

**Files:**
- Modify: `/home/tsavo/platform-ui-core/src/app/admin/payment-methods/page.tsx`
- Modify or Create: `/home/tsavo/platform-ui-core/src/__tests__/admin-payment-methods.test.tsx`

- [ ] **Step 1: Write failing test for new admin form fields**

```typescript
describe("Admin payment methods form", () => {
  it("renders iconUrl input field", async () => {
    // Mock admin payment method list
    // Render the admin page
    // Click "Add" or "Edit"
    // Assert input with label/placeholder "Icon URL" is present
  });

  it("renders displayOrder input field", async () => {
    // Assert input with label/placeholder "Display Order" is present
  });

  it("submits iconUrl and displayOrder in upsert", async () => {
    // Fill in the form including iconUrl and displayOrder
    // Submit
    // Assert the upsert API call includes both fields
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/admin-payment-methods.test.tsx`
Expected: FAIL — fields don't exist yet

- [ ] **Step 3: Add `iconUrl` and `displayOrder` fields to the admin form**

In the payment method upsert form, add:
- `iconUrl` — text input for the icon URL
- `displayOrder` — number input for sort order

These should be required fields in the form validation.

- [ ] **Step 4: Update `PaymentMethodAdmin` type in `api.ts` if needed**

Ensure the admin type includes `iconUrl: string` and `displayOrder: number`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/admin-payment-methods.test.tsx`
Expected: PASS

- [ ] **Step 6: Run check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/payment-methods/page.tsx src/__tests__/admin-payment-methods.test.tsx src/lib/api.ts
git commit -m "feat(admin): add iconUrl and displayOrder to payment method management"
```

---

## Task 15: platform-ui-core — PR, merge, publish

- [ ] **Step 1: Run full test suite**

Run: `npm run check && npm test`
Expected: All pass

- [ ] **Step 2: Create PR with Tasks 12-14**

- [ ] **Step 3: Merge — CI publishes new platform-ui-core version**

- [ ] **Step 4: Note the published version number**

---

## Task 16: Product UI bumps — wopr, paperclip, nemoclaw

**Files:**
- Modify: `/home/tsavo/wopr-platform-ui/package.json`
- Modify: `/home/tsavo/paperclip-platform-ui/package.json`
- Modify: `/home/tsavo/nemoclaw-platform-ui/package.json`

These 3 can run in parallel.

- [ ] **Step 1: Bump platform-ui-core in wopr-platform-ui**

```bash
cd ~/wopr-platform-ui
pnpm add @wopr-network/platform-ui-core@<new-version>
npm run check
```

- [ ] **Step 2: Bump platform-ui-core in paperclip-platform-ui**

```bash
cd ~/paperclip-platform-ui
pnpm add @wopr-network/platform-ui-core@<new-version>
npm run check
```

- [ ] **Step 3: Bump platform-ui-core in nemoclaw-platform-ui**

```bash
cd ~/nemoclaw-platform-ui
pnpm add @wopr-network/platform-ui-core@<new-version>
npm run check
```

- [ ] **Step 4: Create 3 PRs (one per product), merge all**

- [ ] **Step 5: Commit each**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: bump platform-ui-core to <version> (dynamic crypto billing)"
```

---

## Task 17: holyship-ui — Add platform-ui-core dependency and billing page

**Files:**
- Modify: `/home/tsavo/holyship-ui/package.json`
- Create: `/home/tsavo/holyship-ui/src/app/billing/page.tsx`

- [ ] **Step 1: Add platform-ui-core as dependency**

```bash
cd ~/holyship-ui
pnpm add @wopr-network/platform-ui-core@<new-version>
```

- [ ] **Step 2: Add shadcn base styles**

Platform-ui-core components use shadcn/Radix primitives. Add the required CSS variables and Tailwind config entries. Check platform-ui-core's tailwind config for the expected theme variables.

- [ ] **Step 3: Create billing page**

```tsx
// src/app/billing/page.tsx
import { BuyCryptoCreditPanel } from "@wopr-network/platform-ui-core/components/billing/buy-crypto-credits-panel";

export default function BillingPage() {
  return (
    <div className="container mx-auto max-w-2xl py-8">
      <h1 className="text-2xl font-bold mb-6">Billing</h1>
      <BuyCryptoCreditPanel />
    </div>
  );
}
```

Adapt to holyship-ui's layout patterns. Wire `API_BASE_URL` env var.

- [ ] **Step 4: Wire auth adapter**

holyship-ui uses Bearer token auth (`DEFCON_ADMIN_TOKEN` → `Authorization: Bearer` header) via `src/lib/defcon-client.ts`. Platform-ui-core's `apiFetch` uses cookie-based auth with `X-Tenant-Id` headers (better-auth sessions).

These are different auth models. The adapter must bridge them:

Create `/home/tsavo/holyship-ui/src/lib/billing-auth-adapter.ts`:
```typescript
// Adapter that configures platform-ui-core's apiFetch to use
// holyship's Bearer token auth instead of cookie-based better-auth.
// Sets API_BASE_URL to point at the holyship backend.
// Passes DEFCON_ADMIN_TOKEN as Bearer auth header.
// Sets X-Tenant-Id from holyship's tenant context (env var or config).
```

Then in the billing page, initialize the adapter before rendering `BuyCryptoCreditPanel`. The exact integration depends on whether platform-ui-core's `apiFetch` supports custom auth header injection (check `src/lib/api-config.ts` for configuration hooks). If not, platform-ui-core may need a minor change to accept an auth provider callback — this would be a Task 15 addition.

- [ ] **Step 5: Test locally**

Run: `npm run dev`, navigate to `/billing`, verify the crypto panel loads and shows available chains.

- [ ] **Step 6: Run check**

Run: `pnpm check` (holyship-ui's gate: biome + tsc)
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml src/app/billing/
git commit -m "feat: add billing page with platform-ui-core crypto panel"
```

- [ ] **Step 8: PR and merge**

---

## Task 18: Pay server — Deploy and backfill icons

- [ ] **Step 1: Deploy updated platform-core to pay.wopr.bot**

The pay server runs platform-core. Deploy the new version with the `icon_url` and `display_order` columns.

- [ ] **Step 2: Run migration on pay server database**

- [ ] **Step 3: Backfill icons for existing chains via admin API**

```bash
# Example for BTC
curl -X PUT https://pay.wopr.bot/admin/chains/btc \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"iconUrl": "https://cdn.example.com/btc.svg", "displayOrder": 0}'
```

Repeat for each enabled chain (BTC, DOGE, LTC, Base USDC, etc.)

- [ ] **Step 4: Verify GET /chains returns icons**

```bash
curl https://pay.wopr.bot/chains -H "Authorization: Bearer $SERVICE_KEY"
```

Confirm each chain has `iconUrl` and `displayOrder` in the response.

---

## Task 19: End-to-end verification

- [ ] **Step 1: Verify all 4 product UIs show chain icons**

Open each product's billing page. Confirm the crypto panel shows icons from the pay server.

- [ ] **Step 2: Test checkout flow**

Select a chain, create a checkout, verify the correct chain and icon appear in the confirmation.

- [ ] **Step 3: Test partial payment display** (if testable on testnet)

If any chain is on testnet, send a partial payment and verify the UI shows "Received $X of $Y".

- [ ] **Step 4: Test confirmation progress**

Verify confirmations tick up in the UI as blocks are mined.

- [ ] **Step 5: Add a new chain via admin and verify zero-deploy**

Via the admin panel, add a new chain (e.g., a new Base ERC-20 token) with an icon. Refresh any product's billing page. Confirm the new chain appears without any code changes or deploys.
