# Dynamic Crypto Billing End-to-End

**Date:** 2026-03-21
**Status:** Draft
**Scope:** Pay server, platform-core, wopr-platform, platform-ui-core, all 4 product UIs

## Problem

Adding a new cryptocurrency payment method requires code changes across 5+ files and multiple redeploys. The goal: admin adds a chain row in the pay server with an icon, and all 4 products (WOPR, Holy Ship, Paperclip, NemoClaw) immediately show it as a billing option with icon, handle checkout, display partial payment progress, and credit the ledger on confirmation. Zero UI publishes to add a coin.

## Current State

**What works:**
- Pay server `GET /chains` returns enabled chains dynamically
- `CryptoServiceClient.listChains()` wraps it in platform-core
- `buy-crypto-credits-panel.tsx` fetches methods on mount and renders tabs
- Admin panel has full CRUD for payment methods
- Webhook flow: pay server → platform backend → `handleKeyServerWebhook()` → credit ledger

**What's broken (8 gaps):**

### Gap 1: No icon field anywhere
- Pay server `chains` table has no `icon_url` column
- `GET /chains` returns no icon data
- `ChainInfo` type has no `iconUrl`
- UI renders text-only token ticker pills

### Gap 2: `UnifiedCheckoutDeps` hardcoded to 2 chain types
- Interface accepts `evmXpub` + `btcXpub` — can't add LTC/DOGE/Solana dynamically
- Needs a registry pattern: `xpubs: Record<string, string>` or lookup from chains table

### Gap 3: Webhook partial payment data is stringly-typed
- `KeyServerWebhookPayload.amountReceived` is `string | undefined` ("0.0015 BTC")
- No `amountReceivedCents: number` for ledger-safe math
- No `amountExpectedCents: number` for progress calculation
- UI cannot show "received $25 of $50"

### Gap 4: Checkout hardcoded to BTC
- `wopr-platform/src/api/routes/billing.ts:422` passes `chain: "btc"` regardless of user selection
- User picks DOGE in UI → backend creates BTC charge

### Gap 5: tRPC `supportedPaymentMethods` not implemented
- Type stub exists in `trpc-types.ts` but no actual tRPC procedure in the billing router
- `getSupportedPaymentMethods()` in api.ts calls `trpcVanilla.billing.supportedPaymentMethods.query()` — this would fail at runtime if the REST fallback doesn't exist

### Gap 6: tRPC `chargeStatus` not implemented
- Same — type stub only, no router implementation
- UI polls `getChargeStatus()` which calls this nonexistent procedure
- Without it, partial payment progress can't be shown

### Gap 7: tRPC `checkout` mutation not implemented
- Type stub exists, no implementation
- The REST route exists but is hardcoded to BTC (Gap 4)

### Gap 8: holyship-ui has no crypto billing
- Standalone Next.js app, does not depend on platform-ui-core
- Users on Holy Ship product cannot pay with crypto

## Design

### Step 1: Pay Server — `icon_url` on chains

**Database:**
```sql
-- Add columns
ALTER TABLE chains ADD COLUMN icon_url TEXT;
ALTER TABLE chains ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0;

-- Backfill existing chains with icons before enabling the filter
UPDATE chains SET icon_url = 'https://cdn.example.com/btc.svg' WHERE token = 'btc';
-- ... repeat for each existing chain ...

-- After backfill, enforce NOT NULL
ALTER TABLE chains ALTER COLUMN icon_url SET NOT NULL;
```

**Migration safety:** The `NOT NULL` constraint is applied AFTER backfill. During the migration window, `GET /chains` filters out rows where `icon_url IS NULL OR icon_url = ''` so incomplete chains are never served.

**API changes:**
- `GET /chains` response: add `iconUrl: string` and `displayOrder: number` to each entry. Filter out chains where `icon_url` is empty.
- `POST /admin/chains` request: accept `iconUrl: string` and `displayOrder: number` in body
- `PUT /admin/chains/:id` request: accept `iconUrl: string` and `displayOrder: number` for updates

**Icon hosting:** Icons are URLs. Admin provides the URL when registering a chain. Can point to any CDN or static hosting. No file upload needed on the pay server itself.

**Validation:** `icon_url` must be non-empty string. A chain without an icon is incomplete — don't serve it.

### Step 2: Platform-Core — Types and plumbing

**`ChainInfo` type:**
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
  displayOrder: number;  // NEW — admin-controlled sort order
}
```

**`CryptoServiceClient.listChains()`:** Pass through `iconUrl` from pay server response.

**`UnifiedCheckoutDeps` — dynamic xpub registry:**

Replace:
```typescript
interface UnifiedCheckoutDeps {
  evmXpub: string;
  btcXpub?: string;
  // hardcoded per chain type
}
```

With:
```typescript
interface UnifiedCheckoutDeps {
  chargeStore: ICryptoChargeRepository;
  oracle: IPriceOracle;
  cryptoClient: CryptoServiceClient;  // delegates to pay server for address derivation
}
```

The pay server already handles xpub management and address derivation per chain. Platform-core doesn't need xpubs at all — it just calls `createCharge(chain, amountUsd)` on the `CryptoServiceClient` which hits `POST /charges` on the pay server.

**Webhook payload — add integer cents fields:**
```typescript
export interface CryptoWebhookPayload {
  chargeId: string;
  chain: string;
  address: string;
  status: "pending" | "partial" | "confirmed" | "expired" | "failed";
  amountExpectedCents: number;   // NEW — what was requested
  amountReceivedCents: number;   // NEW — what arrived so far
  txHash?: string;               // present once tx seen
  confirmations: number;         // NEW — required, 0 if unconfirmed
  confirmationsRequired: number; // NEW — target for this chain
}
```

**Deprecation:** Keep `amountUsdCents` as a deprecated alias for `amountExpectedCents` for one release cycle so existing webhook handlers don't break. Drop `amountReceived: string` immediately — no consumers use it safely. Mark `amountUsdCents` for removal in the next major.

**Pay server status mapping:** The pay server currently sends free-form `status: string`. We must define the canonical enum on the pay server side and ensure it sends exactly one of: `"pending"`, `"partial"`, `"confirmed"`, `"expired"`, `"failed"`. The old UI checks for `"Settled"` and `"Processing"` — these map to `"confirmed"` and `"partial"` respectively. The pay server deploy (Step 1) must emit the new enum values. Charges created before the deploy will have old-format statuses; `handleKeyServerWebhook` must accept both old and new values during the transition window and normalize to the new enum.

**Charge status response (for UI polling):**
```typescript
export interface ChargeStatusResponse {
  chargeId: string;
  status: "pending" | "partial" | "confirmed" | "expired" | "failed";
  amountExpectedCents: number;
  amountReceivedCents: number;
  confirmations: number;
  confirmationsRequired: number;
  txHash?: string;
  credited: boolean;
}
```

**`ICryptoChargeRepository` schema changes:**

The current interface is:
```typescript
create(referenceId, tenantId, amountUsdCents): Promise<void>
updateStatus(referenceId, status, currency?, filledAmount?): Promise<void>
markCredited(referenceId): Promise<void>
```

This must expand to store partial payment progress:
```typescript
interface ICryptoChargeRepository {
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

type CryptoChargeStatus = "pending" | "partial" | "confirmed" | "expired" | "failed";

interface CryptoCharge {
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
```

**Drizzle migration required in wopr-platform (Step 3):** The `crypto_charges` table needs new columns: `chain TEXT NOT NULL`, `amount_received_cents INTEGER NOT NULL DEFAULT 0`, `confirmations INTEGER NOT NULL DEFAULT 0`, `confirmations_required INTEGER NOT NULL DEFAULT 0`, `tx_hash TEXT`. This migration runs in wopr-platform after the platform-core publish — the new platform-core types define the interface, wopr-platform implements the schema. Existing rows get default values (0 for amounts/confirmations).

**Sequencing constraint:** Platform-core publishes the new `ICryptoChargeRepository` interface (Step 2). wopr-platform's build will break until the implementation is updated (Step 3). These two steps should be a coordinated PR pair — platform-core merges first, wopr-platform PR is ready and merges immediately after.

**Publish:** PR → merge → CI publishes new platform-core version.

### Step 3: wopr-platform Backend — Wire the tRPC procedures

**Rename `cryptoCheckout` → `checkout`:** The existing tRPC router has a `cryptoCheckout` procedure (billing.ts:284) that hardcodes `chain: "btc"`. The UI type stubs reference `checkout`. Rename to `checkout` and delete `cryptoCheckout`. This is not a breaking change for product UIs because they go through platform-ui-core's `createCheckout()` wrapper — only the tRPC procedure name changes, and we control all callers.

**Deprecate REST `POST /billing/crypto/checkout`:** Keep it for one release but log a deprecation warning. All UI traffic moves to the tRPC `checkout` mutation. Remove the REST route in the next release.

**`billing.supportedPaymentMethods` query:**
```typescript
supportedPaymentMethods: publicProcedure.query(async () => {
  const client = getCryptoClient();
  return client.listChains(); // returns ChainInfo[] with iconUrl, displayOrder
}),
```

**Note:** This is intentionally a `publicProcedure` (no auth). Unauthenticated users on pricing/billing pages need to see available payment methods. The data is non-sensitive (chain names, icons, confirmation counts).

**`billing.chargeStatus` query:**
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
      credited: charge.status === "confirmed",
    };
  }),
```

**`billing.checkout` mutation:**
```typescript
checkout: authedProcedure
  .input(z.object({
    chain: z.string().min(1),
    amountUsd: z.number().positive(),
  }))
  .mutation(async ({ input, ctx }) => {
    const client = getCryptoClient();
    const result = await client.createCharge({
      chain: input.chain,        // user-selected, NOT hardcoded
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

**Fix REST route:** Remove hardcoded `chain: "btc"` from `POST /billing/crypto/checkout`. Either deprecate in favor of tRPC or pass `chain` from request body.

**Webhook handler update:** On partial payment webhook (`status: "partial"`), update `chargeStore` with new `amountReceivedCents` and `confirmations`. Don't credit the ledger until `status: "confirmed"`.

### Step 4: Platform-UI-Core — Render it all

**`SupportedPaymentMethod` type update:**
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

**Coin selector pills → icon + ticker:**
```tsx
{methods.map((m) => (
  <button key={m.id} onClick={() => setSelectedMethod(m)} className={cn(...)}>
    <img src={m.iconUrl} alt={m.token} className="h-4 w-4" />
    {m.token}
  </button>
))}
```

**Checkout confirmation — icon in badge:**
```tsx
<Badge variant="outline" className="text-xs">
  <img src={checkout.iconUrl} alt="" className="h-3 w-3 inline mr-1" />
  {checkout.token} on {checkout.chain}
</Badge>
```

**Partial payment progress:**

Replace the binary `waiting`/`detected`/`credited` states with a richer model:

```typescript
type PaymentProgress = {
  status: "waiting" | "partial" | "confirming" | "credited" | "expired" | "failed";
  amountExpectedCents: number;
  amountReceivedCents: number;
  confirmations: number;
  confirmationsRequired: number;
};
```

**Status mapping (old → new):** The current UI checks `status === "Settled"` and `status === "Processing"`. During the transition, the UI must handle both old and new values:

| Old status | New status | UI state |
|-----------|-----------|----------|
| (no tx yet) | `"pending"` | `waiting` |
| `"Processing"` | `"partial"` | `partial` |
| `"Settled"` | `"confirmed"` | `confirming` → `credited` |
| (none) | `"expired"` | `expired` |
| (none) | `"failed"` | `failed` |

The `chargeStatus` tRPC query normalizes to new enum values. The UI only needs to handle the new values.

UI renders:
- **waiting**: "Waiting for payment..."
- **partial**: "Received $25.00 of $50.00 — send $25.00 more to this address"
- **confirming**: "Payment received. Confirming (3 of 6)..."
- **credited**: "Payment confirmed! Credits added."
- **expired**: "Payment expired. Please try again."
- **failed**: "Payment failed."

**Poll interval:** Keep 5s. The `chargeStatus` tRPC query hits the local charge store (fast), not the pay server.

**`createCheckout` API alignment (all 3 layers must match):**

The existing `createCheckout` in `api.ts` sends `{ methodId, amountUsd }`. The backend tRPC mutation accepts `{ chain, amountUsd }`. These must be aligned:

```typescript
// api.ts — updated signature
export async function createCheckout(chain: string, amountUsd: number): Promise<CheckoutResult> {
  return trpcVanilla.billing.checkout.mutate({ chain, amountUsd });
}

// Component call site
const result = await createCheckout(selectedMethod.chain, selectedAmount);
```

The old `methodId` parameter is replaced by `chain`. The backend never used `methodId` — it always needed the chain identifier to call the pay server. This is a coordinated change: platform-ui-core's `createCheckout()` signature changes at the same time as the tRPC mutation input.

**Icon error fallback:**
```tsx
<img
  src={m.iconUrl}
  alt={m.token}
  className="h-4 w-4"
  loading="lazy"
  onError={(e) => { e.currentTarget.style.display = "none"; }}
/>
```

If the CDN 404s, hide the broken image and fall back to showing just the token ticker text (which is already rendered next to the icon).

**Expiry handling in poll loop:**

When `chargeStatus` returns `status: "expired"` or `"failed"`:
1. Clear the poll interval
2. Update `paymentStatus` to `"expired"` or `"failed"`
3. Show a "Try Again" button that calls `handleReset()` (already exists)

```typescript
// In the poll effect:
if (status.status === "expired" || status.status === "failed") {
  setPaymentStatus(status.status);
  clearInterval(interval);
}
```

**Publish:** PR → merge → CI publishes new platform-ui-core version.

### Step 5: Product UI Version Bumps

For wopr-platform-ui, paperclip-platform-ui, nemoclaw-platform-ui:
- Bump `@wopr-network/platform-ui-core` to new version
- Bump `@wopr-network/platform-core` to new version (if they depend on it directly)
- Zero code changes in product UI — all billing lives in platform-ui-core

### Step 6: holyship-ui Integration

holyship-ui (`~/holyship-ui`) is a lightweight standalone Next.js 16 app. Its dependency footprint is minimal: React 19, Tailwind 4, Geist font. No Radix, no shadcn, no framer-motion, no better-auth.

**Stack gap:** platform-ui-core depends on Radix, shadcn, framer-motion, better-auth. Adding it as a dependency would triple holyship-ui's bundle for one billing panel.

**Decision: Option A — add platform-ui-core as dependency.** This is not optional — holyship-ui was always supposed to use platform-ui-core's fleet management, billing, and metered usage framework. The current lightweight state is temporary, not intentional. Adding the dependency now is catching up to the intended architecture.

**Integration work:**
- `pnpm add @wopr-network/platform-ui-core`
- Add shadcn base styles to Tailwind config (platform-ui-core components expect them)
- Import `BuyCryptoCreditPanel` into a `/billing` page
- Wire `API_BASE_URL` env var to point at the holyship backend
- Auth: holyship-ui will need to pass auth cookies to the tRPC client. If holyship uses a different auth system than better-auth, the `apiFetch` wrapper needs a thin adapter.

## Out of Scope

- Network grouping (Base USDC / Base USDT / Base DAI under one "Base" header) — future polish
- Estimated confirmation times — future, could come from pay server metadata
- QR codes for deposit addresses — future
- Auto-refresh crypto price during checkout — future, current price-at-creation is fine
- Fiat + crypto unified picker — they stay as separate panels

## Execution Order

```
1. Pay server deploy (icon_url)
     ↓
2. Platform-core publish (ChainInfo.iconUrl, webhook types, charge status types, dynamic checkout deps)
     ↓
3. wopr-platform deploy (tRPC procedures, fix chain hardcode, webhook handler update)
     ↓
4. Platform-ui-core publish (icons, partial payments UI, checkout flow)
     ↓
5. 3 product UI bumps (parallel)    +    6. holyship-ui integration
```

Steps 5 and 6 can run in parallel. Steps 1-4 are sequential — each depends on the previous.

## Success Criteria

- Admin adds a new chain with icon in pay server → all 4 products show it within one page refresh
- User selects any chain → checkout creates charge on correct chain
- Partial payment → UI shows progress ("received X of Y")
- Full payment → confirmations count up → credits applied
- Zero product UI code changes required to add a new coin
