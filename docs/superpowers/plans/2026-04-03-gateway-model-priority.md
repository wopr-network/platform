# Gateway Model Priority Routing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single `defaultModel` + `tenant_model_selection` table with a per-product ordered model priority list and automatic failover with cooldown.

**Architecture:** Product config gets a `modelPriority: string[]` field. The gateway proxy walks the list on each request, skipping models on cooldown (5-min TTL in-memory cache). On 404/429/5xx/timeout, the current model is marked on cooldown and the next model is tried. `tenant_model_selection` table is dropped entirely.

**Tech Stack:** Drizzle ORM (Postgres), Hono, TypeScript, Vitest

**Spec:** `docs/superpowers/specs/2026-04-03-gateway-model-priority-design.md`

---

### Task 1: Model Health Cache

**Files:**
- Create: `core/platform-core/src/gateway/model-health-cache.ts`
- Create: `core/platform-core/src/gateway/model-health-cache.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// core/platform-core/src/gateway/model-health-cache.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModelHealthCache } from "./model-health-cache.js";

describe("ModelHealthCache", () => {
  let cache: ModelHealthCache;
  const TTL = 300_000; // 5 minutes

  beforeEach(() => {
    vi.useFakeTimers();
    cache = new ModelHealthCache(TTL);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports all models healthy by default", () => {
    expect(cache.isHealthy("qwen/qwen3.6-plus:free")).toBe(true);
  });

  it("marks a model on cooldown", () => {
    cache.markUnhealthy("qwen/qwen3.6-plus:free");
    expect(cache.isHealthy("qwen/qwen3.6-plus:free")).toBe(false);
  });

  it("model becomes healthy again after TTL expires", () => {
    cache.markUnhealthy("qwen/qwen3.6-plus:free");
    vi.advanceTimersByTime(TTL + 1);
    expect(cache.isHealthy("qwen/qwen3.6-plus:free")).toBe(true);
  });

  it("model stays unhealthy before TTL expires", () => {
    cache.markUnhealthy("qwen/qwen3.6-plus:free");
    vi.advanceTimersByTime(TTL - 1000);
    expect(cache.isHealthy("qwen/qwen3.6-plus:free")).toBe(false);
  });

  it("firstHealthyModel returns first non-cooldown model", () => {
    const models = ["model-a", "model-b", "model-c"];
    cache.markUnhealthy("model-a");
    expect(cache.firstHealthyModel(models)).toBe("model-b");
  });

  it("firstHealthyModel returns last model when all on cooldown (best-effort)", () => {
    const models = ["model-a", "model-b", "model-c"];
    cache.markUnhealthy("model-a");
    cache.markUnhealthy("model-b");
    cache.markUnhealthy("model-c");
    expect(cache.firstHealthyModel(models)).toBe("model-c");
  });

  it("firstHealthyModel returns first model when list has one entry", () => {
    expect(cache.firstHealthyModel(["only-model"])).toBe("only-model");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/platform && npx vitest run core/platform-core/src/gateway/model-health-cache.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```typescript
// core/platform-core/src/gateway/model-health-cache.ts
/**
 * In-memory cooldown cache for model health.
 *
 * When a model returns 404/429/5xx/timeout, it's marked unhealthy
 * for a configurable TTL. The gateway skips unhealthy models when
 * walking the product's model priority list.
 */

/** Default cooldown: 5 minutes. */
export const DEFAULT_MODEL_COOLDOWN_MS = 300_000;

export class ModelHealthCache {
  private readonly cooldowns = new Map<string, number>();

  constructor(private readonly ttlMs: number = DEFAULT_MODEL_COOLDOWN_MS) {}

  /** Mark a model as unhealthy. It will be skipped until the TTL expires. */
  markUnhealthy(modelId: string): void {
    this.cooldowns.set(modelId, Date.now() + this.ttlMs);
  }

  /** Check if a model is healthy (not on cooldown). */
  isHealthy(modelId: string): boolean {
    const expiry = this.cooldowns.get(modelId);
    if (expiry === undefined) return true;
    if (Date.now() > expiry) {
      this.cooldowns.delete(modelId);
      return true;
    }
    return false;
  }

  /**
   * Return the first healthy model from the priority list.
   * If ALL models are on cooldown, returns the last model (best-effort).
   */
  firstHealthyModel(models: string[]): string {
    for (const model of models) {
      if (this.isHealthy(model)) return model;
    }
    return models[models.length - 1];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/platform && npx vitest run core/platform-core/src/gateway/model-health-cache.test.ts`
Expected: PASS (all 7 tests)

- [ ] **Step 5: Commit**

```bash
cd ~/platform
git add core/platform-core/src/gateway/model-health-cache.ts core/platform-core/src/gateway/model-health-cache.test.ts
git commit -m "feat(gateway): add model health cache with TTL-based cooldown"
```

---

### Task 2: Add `modelPriority` to Product Config

**Files:**
- Modify: `core/platform-core/src/product-config/presets.ts` — replace `defaultModel` with `modelPriority`
- Modify: `core/platform-core/src/product-config/repository-types.ts` — add `modelPriority` to `ProductFeatures`
- Modify: `core/platform-core/src/db/schema/product-config.ts` — add `model_priority` column
- Create: migration file via `drizzle-kit generate`

- [ ] **Step 1: Update the `ProductPreset` type and all 4 presets**

In `core/platform-core/src/product-config/presets.ts`, replace:

```typescript
  /** Default LLM model for the gateway (e.g. "moonshotai/kimi-k2.5"). */
  defaultModel: string;
```

with:

```typescript
  /** Ordered model priority list for the gateway. First healthy model wins. */
  modelPriority: string[];
```

And in each of the 4 product presets (`wopr`, `paperclip`, `holyship`, `nemoclaw`), replace:

```typescript
    defaultModel: "moonshotai/kimi-k2.5",
```

with:

```typescript
    modelPriority: [
      "qwen/qwen3.6-plus:free",
      "qwen/qwen3.6-plus",
      "moonshotai/kimi-k2.5",
      "openrouter/auto",
    ],
```

- [ ] **Step 2: Add `modelPriority` to the `ProductFeatures` interface**

In `core/platform-core/src/product-config/repository-types.ts`, add to `ProductFeatures`:

```typescript
  /** Ordered model priority list for the gateway. First healthy model wins. */
  modelPriority: string[];
```

- [ ] **Step 3: Add `model_priority` column to `product_features` table**

In `core/platform-core/src/db/schema/product-config.ts`, add to the `productFeatures` table definition:

```typescript
  modelPriority: text("model_priority").array().notNull().default([
    "qwen/qwen3.6-plus:free",
    "qwen/qwen3.6-plus",
    "moonshotai/kimi-k2.5",
    "openrouter/auto",
  ]),
```

- [ ] **Step 4: Generate the migration**

Run: `cd ~/platform/core/platform-core && npm run db:generate`
Expected: New migration file created in `drizzle/migrations/`

- [ ] **Step 5: Verify build compiles**

Run: `cd ~/platform && pnpm build`
Expected: No type errors

- [ ] **Step 6: Commit**

```bash
cd ~/platform
git add core/platform-core/src/product-config/presets.ts \
  core/platform-core/src/product-config/repository-types.ts \
  core/platform-core/src/db/schema/product-config.ts \
  core/platform-core/drizzle/
git commit -m "feat(product-config): add modelPriority field, replace defaultModel"
```

---

### Task 3: Update `boot.ts` to Seed `modelPriority` Instead of `tenant_model_selection`

**Files:**
- Modify: `core/platform-core/src/product-config/boot.ts`

- [ ] **Step 1: Read the current boot.ts to find the seed block**

The current code (around line 77-81) does:
```sql
INSERT INTO tenant_model_selection (tenant_id, default_model, updated_at)
VALUES ('__platform__', '${defaultModel}', now())
ON CONFLICT (tenant_id) DO NOTHING
```

- [ ] **Step 2: Remove the `tenant_model_selection` seed SQL**

Delete the raw SQL insert into `tenant_model_selection`. The `modelPriority` is now seeded into `product_features` via the existing `upsertFeatures` call. Add `modelPriority` to the features upsert that already exists in boot.ts:

```typescript
    await repo.upsertFeatures(product.id, {
      hiddenInstanceTabs: preset.hiddenInstanceTabs ?? [],
      modelPriority: preset.modelPriority,
    });
```

- [ ] **Step 3: Remove the `defaultModel` reference from boot.ts**

Find where `defaultModel` is destructured from the preset and remove it. The preset no longer has `defaultModel`.

- [ ] **Step 4: Verify build compiles**

Run: `cd ~/platform && pnpm build`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
cd ~/platform
git add core/platform-core/src/product-config/boot.ts
git commit -m "feat(boot): seed modelPriority via product_features, remove tenant_model_selection seed"
```

---

### Task 4: Wire Model Priority Into Gateway Proxy

**Files:**
- Modify: `core/platform-core/src/gateway/proxy.ts` — replace `modelFor()` with priority+retry
- Modify: `core/platform-core/src/gateway/types.ts` — update `GatewayConfig` and `ProxyDeps`
- Modify: `core/platform-core/src/gateway/index.ts` — export `ModelHealthCache`
- Create: `core/platform-core/src/gateway/proxy-with-fallback.test.ts`

- [ ] **Step 1: Update `GatewayConfig` in types.ts**

Remove from `GatewayConfig`:
```typescript
  /** Static model override — rewrites body.model before forwarding to upstream. */
  defaultModel?: string;
  /** Dynamic model resolver — called per-request, takes priority over defaultModel.
   *  Return null to fall back to defaultModel / client-specified. */
  resolveDefaultModel?: () => string | null;
```

Add to `GatewayConfig`:
```typescript
  /** Model cooldown TTL in milliseconds. Default: 300_000 (5 minutes). */
  modelCooldownTtlMs?: number;
  /** Shared model health cache instance. Created by mountGateway if not provided. */
  modelHealthCache?: import("./model-health-cache.js").ModelHealthCache;
```

- [ ] **Step 2: Update `ProxyDeps` in proxy.ts**

Remove from `ProxyDeps`:
```typescript
  defaultModel?: string;
  /** Dynamic model resolver — called per-request, overrides defaultModel. Return null to use defaultModel fallback. */
  resolveDefaultModel?: () => string | null;
```

Add to `ProxyDeps`:
```typescript
  /** Shared model health cache for cooldown tracking. */
  modelHealthCache: import("./model-health-cache.js").ModelHealthCache;
```

Update `buildProxyDeps` to pass through the cache:
```typescript
import { DEFAULT_MODEL_COOLDOWN_MS, ModelHealthCache } from "./model-health-cache.js";

// In buildProxyDeps:
    modelHealthCache: config.modelHealthCache ?? new ModelHealthCache(config.modelCooldownTtlMs ?? DEFAULT_MODEL_COOLDOWN_MS),
```

- [ ] **Step 3: Remove `modelFor()` function**

Delete the `modelFor` function entirely (line 47-49 in proxy.ts):
```typescript
// DELETE THIS:
function modelFor(tenant: import("./types.js").GatewayTenant, deps: ProxyDeps): string | null {
  return tenant.defaultModel ?? deps.resolveDefaultModel?.() ?? deps.defaultModel ?? null;
}
```

- [ ] **Step 4: Add `shouldFallback` helper**

Add this helper near the top of proxy.ts:

```typescript
/** Returns true if the HTTP status should trigger model fallback. */
function shouldFallback(status: number): boolean {
  return status === 404 || status === 429 || status >= 500;
}
```

- [ ] **Step 5: Refactor `chatCompletions` to use model priority with retry**

Replace the model resolution + OpenRouter fetch block in `chatCompletions` (after the arbitrage block, starting at line ~327) with a retry loop. The key change: instead of resolving one model and sending one request, read `modelPriority` from the tenant's product config (passed via `GatewayTenant`), walk the priority list using the health cache, and retry on failure.

The tenant already has `productSlug` resolved. The `modelPriority` array will be attached to the `GatewayTenant` type (see Task 5) alongside the existing `defaultModel` field during the transition.

```typescript
    // --- Model priority fallback loop ---
    const modelPriority = tenant.modelPriority ?? ["openrouter/auto"];
    const providerCfg = deps.providers.openrouter;
    if (!providerCfg) {
      return c.json(
        { error: { message: "LLM service not configured", type: "server_error", code: "service_unavailable" } },
        503,
      );
    }
    const baseUrl = providerCfg.baseUrl ?? "https://openrouter.ai/api";

    // Walk priority list, skipping models on cooldown
    let lastError: unknown = null;
    let lastStatus = 502;
    const modelsToTry: string[] = [];
    for (const model of modelPriority) {
      if (deps.modelHealthCache.isHealthy(model)) modelsToTry.push(model);
    }
    // If all on cooldown, try the last model anyway (best-effort)
    if (modelsToTry.length === 0) modelsToTry.push(modelPriority[modelPriority.length - 1]);

    for (const currentModel of modelsToTry) {
      try {
        // Rewrite model in the parsed body
        if (parsedBody) parsedBody.model = currentModel;
        const serializedBody = parsedBody ? JSON.stringify(parsedBody) : rawBody;

        const res = await deps.fetchFn(`${baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${providerCfg.apiKey}`,
            "Content-Type": "application/json",
          },
          body: serializedBody,
        });

        // Check if we should fallback to next model
        if (!res.ok && shouldFallback(res.status) && currentModel !== modelsToTry[modelsToTry.length - 1]) {
          deps.modelHealthCache.markUnhealthy(currentModel);
          logger.warn("Gateway model fallback", {
            tenant: tenant.id,
            failedModel: currentModel,
            status: res.status,
          });
          lastStatus = res.status;
          lastError = new Error(`Model ${currentModel} returned ${res.status}`);
          continue; // Try next model
        }

        // Success path (or non-fallback error — return as-is)
        if (isStreaming && res.ok) {
          return proxySSEStream(res, {
            tenant,
            deps,
            capability: "chat-completions",
            provider: "openrouter",
            costHeader: res.headers.get("x-openrouter-cost"),
            model: currentModel,
            rateLookupFn: deps.rateLookupFn,
          });
        }

        const responseBody = await res.text();
        const costHeader = res.headers.get("x-openrouter-cost");
        const cost = costHeader
          ? parseFloat(costHeader)
          : await estimateTokenCost(responseBody, currentModel, deps.rateLookupFn);

        logger.info("Gateway proxy: chat/completions", {
          tenant: tenant.id,
          status: res.status,
          cost,
          model: currentModel,
        });

        if (res.ok) {
          let usage: { units: number; unitType: string } | undefined;
          let metadata: Record<string, unknown> | undefined;
          try {
            const parsed = JSON.parse(responseBody) as {
              usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
              model?: string;
            };
            const inputTokens = parsed.usage?.prompt_tokens ?? 0;
            const outputTokens = parsed.usage?.completion_tokens ?? 0;
            const totalTokens = parsed.usage?.total_tokens ?? inputTokens + outputTokens;
            if (totalTokens > 0) {
              usage = { units: totalTokens, unitType: "tokens" };
              metadata = { inputTokens, outputTokens, model: parsed.model ?? currentModel };
            }
          } catch {
            // proceed without usage data
          }
          emitMeterEventForTenant(deps, tenant, "chat-completions", "openrouter", Credit.fromDollars(cost), undefined, {
            usage,
            tier: "branded",
            metadata,
          });
          debitCredits(deps, tenant.id, cost, marginFor(tenant, deps), "chat-completions", "openrouter");
        }

        // Sanitize OpenRouter-specific fields from usage
        let sanitizedBody = responseBody;
        try {
          const parsed = JSON.parse(responseBody) as Record<string, unknown>;
          if (parsed.usage && typeof parsed.usage === "object") {
            const u = parsed.usage as Record<string, unknown>;
            parsed.usage = {
              prompt_tokens: u.prompt_tokens,
              completion_tokens: u.completion_tokens,
              total_tokens: u.total_tokens,
            };
            sanitizedBody = JSON.stringify(parsed);
          }
        } catch {
          // Forward raw body if parse fails
        }

        return new Response(sanitizedBody, {
          status: res.status,
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        // Network error / timeout — mark on cooldown and try next
        deps.modelHealthCache.markUnhealthy(currentModel);
        logger.warn("Gateway model network error", {
          tenant: tenant.id,
          failedModel: currentModel,
          error: error instanceof Error ? error.message : String(error),
        });
        lastError = error;
        lastStatus = 502;
        continue;
      }
    }

    // All models exhausted
    deps.metrics?.recordGatewayError("chat-completions");
    logger.error("Gateway proxy: all models exhausted", { tenant: tenant.id, modelsAttempted: modelsToTry });
    const mapped = mapProviderError(lastError, "openrouter");
    return c.json(mapped.body, mapped.status as 502);
```

Note: Keep `marginFor()` — it reads `tenant.margin` which is still the billing margin from product config. Only `modelFor()` is removed.

- [ ] **Step 6: Export `ModelHealthCache` from gateway index**

In `core/platform-core/src/gateway/index.ts`, add:

```typescript
export { DEFAULT_MODEL_COOLDOWN_MS, ModelHealthCache } from "./model-health-cache.js";
```

- [ ] **Step 7: Write integration test for model fallback**

```typescript
// core/platform-core/src/gateway/proxy-with-fallback.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModelHealthCache } from "./model-health-cache.js";

describe("chatCompletions model fallback", () => {
  let cache: ModelHealthCache;

  beforeEach(() => {
    vi.useFakeTimers();
    cache = new ModelHealthCache(300_000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("skips unhealthy model and tries next", () => {
    cache.markUnhealthy("model-a");
    const models = ["model-a", "model-b", "model-c"];
    const result = cache.firstHealthyModel(models);
    expect(result).toBe("model-b");
  });

  it("marks model unhealthy on 404", () => {
    cache.markUnhealthy("qwen/qwen3.6-plus:free");
    expect(cache.isHealthy("qwen/qwen3.6-plus:free")).toBe(false);
    expect(cache.isHealthy("qwen/qwen3.6-plus")).toBe(true);
  });

  it("recovers model after TTL", () => {
    cache.markUnhealthy("qwen/qwen3.6-plus:free");
    vi.advanceTimersByTime(300_001);
    expect(cache.isHealthy("qwen/qwen3.6-plus:free")).toBe(true);
  });
});
```

- [ ] **Step 8: Run tests**

Run: `cd ~/platform && npx vitest run core/platform-core/src/gateway/proxy-with-fallback.test.ts core/platform-core/src/gateway/model-health-cache.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
cd ~/platform
git add core/platform-core/src/gateway/proxy.ts \
  core/platform-core/src/gateway/types.ts \
  core/platform-core/src/gateway/index.ts \
  core/platform-core/src/gateway/proxy-with-fallback.test.ts
git commit -m "feat(gateway): model priority fallback with cooldown in chatCompletions"
```

---

### Task 5: Add `modelPriority` to `GatewayTenant` and Wire in `mount-routes.ts`

**Files:**
- Modify: `core/platform-core/src/gateway/types.ts` — add `modelPriority` to `GatewayTenant`
- Modify: `core/platform-core/src/server/mount-routes.ts` — replace `tenant_model_selection` SQL with product config read

- [ ] **Step 1: Add `modelPriority` to `GatewayTenant`**

In `core/platform-core/src/gateway/types.ts`, add to `GatewayTenant`:

```typescript
  /** Ordered model priority list from product config. Gateway tries models in order, skipping cooldowns. */
  modelPriority?: string[];
```

- [ ] **Step 2: Replace the `tenant_model_selection` SQL in `mount-routes.ts`**

In the `resolveServiceKey` callback inside `mountRoutes` (around lines 664-711), the current code does a raw SQL query against `tenant_model_selection`. Replace the entire `// Default model:` block with:

```typescript
        // Model priority: read from product config (replaces tenant_model_selection)
        if (tenant.productSlug) {
          const pc = await container.productConfigService.getBySlug(tenant.productSlug);
          if (pc?.features?.modelPriority?.length) {
            tenant.modelPriority = pc.features.modelPriority;
          }
        }
        if (!tenant.modelPriority?.length) {
          tenant.modelPriority = ["openrouter/auto"];
        }
```

Remove the `drizzle-orm` sql import that was only used for the `tenant_model_selection` query (if no other raw SQL remains in the function).

- [ ] **Step 3: Verify build compiles**

Run: `cd ~/platform && pnpm build`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
cd ~/platform
git add core/platform-core/src/gateway/types.ts core/platform-core/src/server/mount-routes.ts
git commit -m "feat(gateway): wire modelPriority from product config into GatewayTenant"
```

---

### Task 6: Update Admin Routes to Use `modelPriority`

**Files:**
- Modify: `core/platform-core/src/server/routes/admin.ts` — replace `getGatewayModel`/`setGatewayModel` with `modelPriority`-based endpoints

- [ ] **Step 1: Read the current admin.ts to understand the gateway model admin endpoints**

The current admin routes use `tenantModelSelection` to get/set the `__platform__` global model. Replace these with endpoints that read/write `modelPriority` on `product_features` via the `productConfigService`.

- [ ] **Step 2: Replace `getGatewayModel` admin endpoint**

Replace the existing `getGatewayModel` implementation. Remove the `tenantModelSelection` import. Use `productConfigService.getBySlug()` instead:

```typescript
    getGatewayModel: adminProcedure.query(async () => {
      // Return model priority for all products
      const allProducts = await container.productConfigService.listAll();
      return allProducts.map((pc) => ({
        slug: pc.product.slug,
        modelPriority: pc.features?.modelPriority ?? [],
      }));
    }),
```

- [ ] **Step 3: Replace `setGatewayModel` admin endpoint**

Replace with a `setModelPriority` that takes a product slug and model list:

```typescript
    setModelPriority: adminProcedure
      .input(z.object({
        slug: z.string().min(1),
        modelPriority: z.array(z.string().min(1).max(256)).min(1).max(10),
      }))
      .mutation(async ({ input }) => {
        const pc = await container.productConfigService.getBySlug(input.slug);
        if (!pc) throw new TRPCError({ code: "NOT_FOUND", message: `Product ${input.slug} not found` });
        await container.productConfigService.upsertFeatures(pc.product.id, {
          modelPriority: input.modelPriority,
        });
        return { slug: input.slug, modelPriority: input.modelPriority };
      }),
```

- [ ] **Step 4: Remove the module-level model cache variables**

Remove `cachedModel`, `modelCacheExpiry`, `CACHE_TTL_MS`, `GLOBAL_TENANT_ID`, and `refreshModelCache` — these were all for the `tenant_model_selection`-based approach.

- [ ] **Step 5: Remove the `tenantModelSelection` import**

Remove: `import { tenantModelSelection } from "../../db/schema/tenant-model-selection.js";`

- [ ] **Step 6: Verify build compiles**

Run: `cd ~/platform && pnpm build`
Expected: No type errors

- [ ] **Step 7: Commit**

```bash
cd ~/platform
git add core/platform-core/src/server/routes/admin.ts
git commit -m "feat(admin): replace gateway model endpoints with modelPriority per product"
```

---

### Task 7: Delete `tenant_model_selection` Infrastructure

**Files:**
- Delete: `core/platform-core/src/db/schema/tenant-model-selection.ts`
- Delete: `core/platform-core/src/trpc/routers/model-selection.ts`
- Modify: `core/platform-core/src/trpc/index.ts` — remove model-selection exports
- Modify: `core/platform-core/src/db/schema/index.ts` — remove re-export if present
- Create: migration to drop table

- [ ] **Step 1: Delete the schema file**

Delete `core/platform-core/src/db/schema/tenant-model-selection.ts`

- [ ] **Step 2: Delete the tRPC model-selection router**

Delete `core/platform-core/src/trpc/routers/model-selection.ts`

- [ ] **Step 3: Remove exports from tRPC index**

In `core/platform-core/src/trpc/index.ts`, remove:

```typescript
export {
  createModelSelectionRouter,
  type ITenantModelSelectionRepository,
  type ModelSelectionRouterDeps,
} from "./routers/model-selection.js";
```

- [ ] **Step 4: Check and clean `db/schema/index.ts`**

If `tenantModelSelection` is re-exported from `core/platform-core/src/db/schema/index.ts`, remove that line. (Grep showed no matches, but verify.)

- [ ] **Step 5: Generate migration to drop the table**

Run: `cd ~/platform/core/platform-core && npm run db:generate`

Verify the generated migration contains:
```sql
DROP TABLE "tenant_model_selection";
```

- [ ] **Step 6: Verify build compiles**

Run: `cd ~/platform && pnpm build`
Expected: No type errors

- [ ] **Step 7: Commit**

```bash
cd ~/platform
git add -A core/platform-core/src/db/schema/tenant-model-selection.ts \
  core/platform-core/src/trpc/routers/model-selection.ts \
  core/platform-core/src/trpc/index.ts \
  core/platform-core/src/db/schema/index.ts \
  core/platform-core/drizzle/
git commit -m "chore: drop tenant_model_selection table and tRPC router from platform-core"
```

---

### Task 8: Clean Up `wopr-platform` Consumers

**Files:**
- Delete: `wopr-platform/src/db/tenant-model-selection-repository.ts`
- Delete: `wopr-platform/src/db/tenant-model-selection-repository.test.ts`
- Delete: `wopr-platform/src/trpc/routers/model-selection.ts`
- Delete: `wopr-platform/src/trpc/routers/model-selection.test.ts`
- Modify: `wopr-platform/src/trpc/index.ts` — remove `modelSelection` from router
- Modify: `wopr-platform/src/index.ts` — remove model selection wiring

- [ ] **Step 1: Delete the repository and its test**

Delete:
- `wopr-platform/src/db/tenant-model-selection-repository.ts`
- `wopr-platform/src/db/tenant-model-selection-repository.test.ts`

- [ ] **Step 2: Delete the tRPC router and its test**

Delete:
- `wopr-platform/src/trpc/routers/model-selection.ts`
- `wopr-platform/src/trpc/routers/model-selection.test.ts`

- [ ] **Step 3: Remove `modelSelection` from the app router**

In `wopr-platform/src/trpc/index.ts`:

Remove the import:
```typescript
import { modelSelectionRouter } from "./routers/model-selection.js";
```

Remove from the router object:
```typescript
    modelSelection: modelSelectionRouter,
```

Remove the export:
```typescript
export { setModelSelectionRouterDeps } from "./routers/model-selection.js";
```

- [ ] **Step 4: Remove model selection wiring from index.ts**

In `wopr-platform/src/index.ts`, remove the block around lines 584-590:

```typescript
  // Wire model selection tRPC router deps
  {
    const { DrizzleTenantModelSelectionRepository } = await import("./db/tenant-model-selection-repository.js");
    const repo = new DrizzleTenantModelSelectionRepository(getDb());
    setModelSelectionRouterDeps({ getRepository: () => repo });
    logger.info("tRPC model selection router initialized");
  }
```

- [ ] **Step 5: Verify build compiles**

Run: `cd ~/wopr-platform && npm run check`
Expected: No errors

- [ ] **Step 6: Run tests**

Run: `cd ~/wopr-platform && npm test`
Expected: PASS (model-selection tests removed, remaining tests unaffected)

- [ ] **Step 7: Commit**

```bash
cd ~/wopr-platform
git add -A src/db/tenant-model-selection-repository.ts \
  src/db/tenant-model-selection-repository.test.ts \
  src/trpc/routers/model-selection.ts \
  src/trpc/routers/model-selection.test.ts \
  src/trpc/index.ts \
  src/index.ts
git commit -m "chore: remove tenant_model_selection from wopr-platform"
```

---

### Task 9: Run Full CI Gate and Deploy

**Files:** None (verification only)

- [ ] **Step 1: Run the full CI gate on platform monorepo**

Run: `cd ~/platform && pnpm lint && pnpm format && pnpm build && pnpm protocol:gen && pnpm test`
Expected: All gates pass

- [ ] **Step 2: Run wopr-platform checks**

Run: `cd ~/wopr-platform && npm run check && npm test`
Expected: All pass

- [ ] **Step 3: Apply migration on production**

```bash
ssh root@138.68.30.247 "docker exec core-server-platform-api-1 npm run db:migrate"
```

This will:
1. Add `model_priority` column to `product_features`
2. Drop the `tenant_model_selection` table

- [ ] **Step 4: Restart the platform API to pick up new code**

```bash
ssh root@138.68.30.247 "cd /opt/core-server && docker compose pull platform-api && docker compose up -d platform-api"
```

- [ ] **Step 5: Verify gateway works with new model priority**

Test a chat completion through the gateway and verify logs show model selection from priority list:

```bash
ssh root@138.68.30.247 "docker logs core-server-platform-api-1 --tail 20 | grep 'Gateway model'"
```

- [ ] **Step 6: Commit any fixups**

If any gate fixes were needed, commit them.
