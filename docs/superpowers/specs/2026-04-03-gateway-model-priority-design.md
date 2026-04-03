# Gateway Model Priority Routing

**Date:** 2026-04-03
**Status:** Draft
**Scope:** platform-core gateway

## Problem

The gateway resolves a single default model per request via a confusing chain:
`tenant_model_selection` (per-tenant row) → `__platform__` row → hardcoded `"openrouter/auto"`.

This conflates product-level defaults with tenant-level overrides. The `tenant_model_selection`
table is doing double duty as a global config hack. There is no fallback when a model goes
offline (free tier disappears, rate limiting, provider outage).

## Solution

Replace the single `defaultModel` string and the `tenant_model_selection` table with a
**per-product ordered model priority list** stored in product config. The gateway walks
the list, skipping models on cooldown, and retries with the next model on failure.

## Design

### 1. Product Config: `modelPriority` field

Add `modelPriority: string[]` to the product config schema. This replaces `defaultModel`.

Default for all products:

```json
["qwen/qwen3.6-plus:free", "qwen/qwen3.6-plus", "moonshotai/kimi-k2.5", "openrouter/auto"]
```

The presets file seeds this. The admin API can update it per-product via the existing
product config update flow.

### 2. Model Health Cache (Circuit Breaker)

In-memory `Map<string, number>` mapping model ID → cooldown-expiry timestamp.

- **Cooldown TTL:** 5 minutes (configurable via `GatewayConfig`)
- **Triggers:** HTTP 404, 429, 5xx, connection timeout
- **Does NOT trigger on:** 400 (bad request), 401/403 (auth), 402 (billing)
- **Scope:** Process-global (shared across all tenants/products)

When the gateway picks a model, it skips any model whose cooldown hasn't expired.
If ALL models are on cooldown, it tries the last model in the list anyway (best-effort).

### 3. Gateway Proxy Flow (Revised)

```
1. Resolve tenant from service key (existing)
2. Resolve product config from tenant.productSlug (existing)
3. Read modelPriority from product config
4. For each model in priority order:
   a. Skip if model is on cooldown
   b. Rewrite request body.model → this model
   c. Send to upstream provider
   d. If success → return response (meter + debit as normal)
   e. If 404/429/5xx/timeout → mark model on cooldown, continue to next
5. If all models exhausted → return last error to caller
```

### 4. Drop `tenant_model_selection`

- Remove the `tenant_model_selection` schema definition
- Remove `DrizzleTenantModelSelectionRepository` and its interface
- Remove the raw SQL query in `mount-routes.ts` (lines 676-709) that resolves
  `tenant.defaultModel` from this table
- Generate a migration that drops the table
- Remove references in wopr-platform's `tenant-model-selection-repository.ts`

### 5. Billing

No change to billing. The gateway still:
- Reads margin from product config (`billing.marginConfig.default`)
- Debits credits from the tenant's balance
- Emits meter events with tenant ID, product slug, and provider

Model selection is a product concern. Billing is a tenant concern. They're decoupled.

### 6. Migration Path

1. Add `modelPriority` to product config schema + presets
2. Seed/update existing product configs in DB with the new field
3. Update gateway to read `modelPriority` instead of `defaultModel`
4. Add model health cache + retry loop to gateway proxy
5. Drop `tenant_model_selection` table
6. Clean up dead code (repository, imports, mount-routes SQL)

### 7. Preset Changes

```typescript
// Before (each product)
defaultModel: "moonshotai/kimi-k2.5",

// After (each product)
modelPriority: [
  "qwen/qwen3.6-plus:free",
  "qwen/qwen3.6-plus",
  "moonshotai/kimi-k2.5",
  "openrouter/auto",
],
```

The `defaultModel` field is removed from `ProductPreset`.

### 8. GatewayConfig Changes

```typescript
// Remove
defaultModel?: string;
resolveDefaultModel?: () => string | null;

// Add
modelCooldownTtlMs?: number; // Default: 300_000 (5 minutes)
```

The gateway no longer needs a static model or resolver — it reads from product config.

### 9. Admin API

No new endpoints. The existing product config update flow handles `modelPriority`.
Admins can reorder or swap models via the product config admin API.

## Non-Goals

- Per-tenant model overrides (YAGNI — users don't pick models)
- Per-request model selection by the caller (gateway owns this)
- Multi-provider fallback (all models go through OpenRouter today)
- Persistent cooldown state (in-memory is fine — restarts clear it, which is correct)

## Files Changed

### platform-core
- `src/product-config/presets.ts` — replace `defaultModel` with `modelPriority`
- `src/db/schema/product-config.ts` — update types if needed
- `src/gateway/proxy.ts` — add retry loop with model priority
- `src/gateway/types.ts` — add `modelCooldownTtlMs` to `GatewayConfig`
- `src/gateway/model-health-cache.ts` — new file, ~30 lines
- `src/server/mount-routes.ts` — remove `tenant_model_selection` SQL, read `modelPriority` from product config
- `src/db/schema/tenant-model-selection.ts` — delete
- Migration to drop `tenant_model_selection` table

### wopr-platform
- `src/db/tenant-model-selection-repository.ts` — delete
- `src/db/tenant-model-selection-repository.test.ts` — delete
