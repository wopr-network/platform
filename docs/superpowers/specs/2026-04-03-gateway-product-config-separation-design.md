# Gateway Product Config Separation

**Date:** 2026-04-03
**Status:** Approved
**Scope:** platform-core gateway

## Problem

`GatewayTenant` carries product-level fields (`margin`, `modelPriority`, `floorInputRatePer1k`,
`floorOutputRatePer1k`) that are resolved from `ProductConfig` at request time and stuffed onto
the tenant object. This conflates tenant identity with product configuration. Dead fields
(`planTier`, `inferenceMode`, `defaultModel`) add further confusion.

## Solution

Pass `ProductConfig` through the gateway middleware as a separate context value alongside
`GatewayTenant`. Gateway handlers read product config directly instead of reading copied
fields from the tenant.

## Design

### 1. Clean `GatewayTenant`

Remove: `margin`, `defaultModel`, `modelPriority`, `floorInputRatePer1k`,
`floorOutputRatePer1k`, `planTier`, `inferenceMode`.

Keep:
```typescript
interface GatewayTenant {
  id: string;
  type?: "personal" | "org" | "platform_service";
  spendLimits: SpendLimits;
  instanceId?: string;
  productSlug?: string;
  spendingCaps?: SpendingCaps;
}
```

### 2. Add `productConfig` to `GatewayAuthEnv`

The Hono context env already has `gatewayTenant`. Add `productConfig: ProductConfig`.
Set in the service-key-auth middleware after resolving the tenant's product.

### 3. Update `resolveServiceKey` in `mount-routes.ts`

Currently returns a `GatewayTenant` with product fields stuffed on. Change to return
`{ tenant: GatewayTenant, productConfig: ProductConfig }`. The product config is already
being fetched via `getBySlug()` — just return it separately instead of copying fields.

### 4. Update gateway handlers

All handlers that currently read `tenant.margin`, `tenant.modelPriority`, etc. will read
from `c.get("productConfig")` instead:

- `margin` → `productConfig.billing.marginConfig.default`
- `modelPriority` → `productConfig.features.modelPriority`
- `floorInputRatePer1k` → `productConfig.features.floorInputRatePer1k`
- `floorOutputRatePer1k` → `productConfig.features.floorOutputRatePer1k`

### 5. Update `ProxyDeps`

Remove `defaultMargin` — margin comes from product config per-request, not from deps.

### 6. Delete dead fields

Remove `planTier`, `inferenceMode`, `defaultModel` from `GatewayTenant` entirely.
Remove any code that reads or sets these fields.

## Files Changed

- `src/gateway/types.ts` — slim down `GatewayTenant`, update `GatewayAuthEnv`
- `src/gateway/proxy.ts` — read product config from context, remove `defaultMargin` from deps
- `src/gateway/streaming.ts` — read margin/floor rates from product config
- `src/gateway/credit-gate.ts` — remove `inferenceMode` check
- `src/gateway/service-key-auth.ts` — set `productConfig` on context
- `src/server/mount-routes.ts` — return product config alongside tenant
- `src/gateway/*.test.ts` — update mocks

## Non-Goals

- Changing `ProductConfig` type or DB schema (already correct)
- Changing the admin API
- Changing how product config is resolved (already works)
