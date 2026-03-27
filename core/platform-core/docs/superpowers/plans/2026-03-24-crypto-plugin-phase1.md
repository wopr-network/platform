# Crypto Plugin Architecture — Phase 1: Interfaces + DB + Registry

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Define plugin interfaces, migrate DB schema from hardcoded address_type/watcher_type to key_rings + plugin_id, create plugin registry. Zero behavior change — existing chains continue working.

**Architecture:** Platform-core defines `IChainPlugin`, `ICurveDeriver`, `IAddressEncoder`, `IChainWatcher`, `ISweepStrategy` interfaces. New `key_rings` table decouples key material from payment methods. `PluginRegistry` maps plugin IDs to implementations. Existing chain code is NOT extracted yet (Phase 2).

**Tech Stack:** TypeScript, Drizzle ORM, PostgreSQL, Vitest

**Spec:** `docs/superpowers/specs/2026-03-24-crypto-plugin-architecture-design.md`

---

### Task 1: Define Core Interfaces

**Files:**
- Create: `src/billing/crypto/plugin/interfaces.ts`
- Test: `src/billing/crypto/plugin/__tests__/interfaces.test.ts`

- [ ] **Step 1: Write interface type tests**

```ts
// src/billing/crypto/plugin/__tests__/interfaces.test.ts
import { describe, expect, it } from "vitest";
import type {
  EncodingParams,
  IAddressEncoder,
  IChainPlugin,
  IChainWatcher,
  ICurveDeriver,
  ISweepStrategy,
  PaymentEvent,
  WatcherOpts,
} from "../interfaces.js";

describe("plugin interfaces — type contracts", () => {
  it("PaymentEvent has required fields", () => {
    const event: PaymentEvent = {
      chain: "ethereum",
      token: "ETH",
      from: "0xabc",
      to: "0xdef",
      rawAmount: "1000000000000000000",
      amountUsdCents: 350000,
      txHash: "0x123",
      blockNumber: 100,
      confirmations: 6,
      confirmationsRequired: 6,
    };
    expect(event.chain).toBe("ethereum");
    expect(event.amountUsdCents).toBe(350000);
  });

  it("ICurveDeriver contract is satisfiable", () => {
    const deriver: ICurveDeriver = {
      derivePublicKey: (_chain: number, _index: number) => new Uint8Array(33),
      getCurve: () => "secp256k1",
    };
    expect(deriver.getCurve()).toBe("secp256k1");
    expect(deriver.derivePublicKey(0, 0)).toBeInstanceOf(Uint8Array);
  });

  it("IAddressEncoder contract is satisfiable", () => {
    const encoder: IAddressEncoder = {
      encode: (_pk: Uint8Array, _params: EncodingParams) => "bc1qtest",
      encodingType: () => "bech32",
    };
    expect(encoder.encodingType()).toBe("bech32");
    expect(encoder.encode(new Uint8Array(33), { hrp: "bc" })).toBe("bc1qtest");
  });

  it("IChainWatcher contract is satisfiable", () => {
    const watcher: IChainWatcher = {
      init: async () => {},
      poll: async () => [],
      setWatchedAddresses: () => {},
      getCursor: () => 0,
      stop: () => {},
    };
    expect(watcher.getCursor()).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/billing/crypto/plugin/__tests__/interfaces.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write interfaces**

```ts
// src/billing/crypto/plugin/interfaces.ts

export interface PaymentEvent {
  chain: string;
  token: string;
  from: string;
  to: string;
  rawAmount: string;
  amountUsdCents: number;
  txHash: string;
  blockNumber: number;
  confirmations: number;
  confirmationsRequired: number;
}

export interface ICurveDeriver {
  derivePublicKey(chainIndex: number, addressIndex: number): Uint8Array;
  getCurve(): "secp256k1" | "ed25519";
}

export interface EncodingParams {
  hrp?: string;
  version?: string;
  [key: string]: string | undefined;
}

export interface IAddressEncoder {
  encode(publicKey: Uint8Array, params: EncodingParams): string;
  encodingType(): string;
}

export interface KeyPair {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  address: string;
  index: number;
}

export interface DepositInfo {
  index: number;
  address: string;
  nativeBalance: bigint;
  tokenBalances: Array<{ token: string; balance: bigint; decimals: number }>;
}

export interface SweepResult {
  index: number;
  address: string;
  token: string;
  amount: string;
  txHash: string;
}

export interface ISweepStrategy {
  scan(keys: KeyPair[], treasury: string): Promise<DepositInfo[]>;
  sweep(keys: KeyPair[], treasury: string, dryRun: boolean): Promise<SweepResult[]>;
}

export interface IPriceOracle {
  getPrice(token: string, feedAddress?: string): Promise<{ priceMicros: number }>;
}

export interface IWatcherCursorStore {
  get(watcherId: string): Promise<number | null>;
  save(watcherId: string, cursor: number): Promise<void>;
  getConfirmationCount(watcherId: string, txKey: string): Promise<number | null>;
  saveConfirmationCount(watcherId: string, txKey: string, count: number): Promise<void>;
}

export interface WatcherOpts {
  rpcUrl: string;
  rpcHeaders: Record<string, string>;
  oracle: IPriceOracle;
  cursorStore: IWatcherCursorStore;
  token: string;
  chain: string;
  contractAddress?: string;
  decimals: number;
  confirmations: number;
}

export interface SweeperOpts {
  rpcUrl: string;
  rpcHeaders: Record<string, string>;
  token: string;
  chain: string;
  contractAddress?: string;
  decimals: number;
}

export interface IChainWatcher {
  init(): Promise<void>;
  poll(): Promise<PaymentEvent[]>;
  setWatchedAddresses(addresses: string[]): void;
  getCursor(): number;
  stop(): void;
}

export interface IChainPlugin {
  pluginId: string;
  supportedCurve: "secp256k1" | "ed25519";
  encoders: Record<string, IAddressEncoder>;
  createWatcher(opts: WatcherOpts): IChainWatcher;
  createSweeper(opts: SweeperOpts): ISweepStrategy;
  version: number;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/billing/crypto/plugin/__tests__/interfaces.test.ts`
Expected: PASS

- [ ] **Step 5: Lint and commit**

```bash
npx biome check --write src/billing/crypto/plugin/
git add src/billing/crypto/plugin/
git commit -m "feat: define crypto plugin interfaces (IChainPlugin, ICurveDeriver, IAddressEncoder, IChainWatcher, ISweepStrategy)"
```

---

### Task 2: Create Plugin Registry

**Files:**
- Create: `src/billing/crypto/plugin/registry.ts`
- Test: `src/billing/crypto/plugin/__tests__/registry.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/billing/crypto/plugin/__tests__/registry.test.ts
import { describe, expect, it } from "vitest";
import { PluginRegistry } from "../registry.js";
import type { IChainPlugin } from "../interfaces.js";

function mockPlugin(id: string, curve: "secp256k1" | "ed25519" = "secp256k1"): IChainPlugin {
  return {
    pluginId: id,
    supportedCurve: curve,
    encoders: {},
    createWatcher: () => ({ init: async () => {}, poll: async () => [], setWatchedAddresses: () => {}, getCursor: () => 0, stop: () => {} }),
    createSweeper: () => ({ scan: async () => [], sweep: async () => [] }),
    version: 1,
  };
}

describe("PluginRegistry", () => {
  it("registers and retrieves a plugin", () => {
    const reg = new PluginRegistry();
    reg.register(mockPlugin("evm"));
    expect(reg.get("evm")).toBeDefined();
    expect(reg.get("evm")?.pluginId).toBe("evm");
  });

  it("throws on duplicate registration", () => {
    const reg = new PluginRegistry();
    reg.register(mockPlugin("evm"));
    expect(() => reg.register(mockPlugin("evm"))).toThrow("already registered");
  });

  it("returns undefined for unknown plugin", () => {
    const reg = new PluginRegistry();
    expect(reg.get("unknown")).toBeUndefined();
  });

  it("lists all registered plugins", () => {
    const reg = new PluginRegistry();
    reg.register(mockPlugin("evm"));
    reg.register(mockPlugin("solana", "ed25519"));
    expect(reg.list()).toHaveLength(2);
    expect(reg.list().map((p) => p.pluginId).sort()).toEqual(["evm", "solana"]);
  });

  it("getOrThrow throws for unknown plugin", () => {
    const reg = new PluginRegistry();
    expect(() => reg.getOrThrow("nope")).toThrow("not registered");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/billing/crypto/plugin/__tests__/registry.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```ts
// src/billing/crypto/plugin/registry.ts
import type { IChainPlugin } from "./interfaces.js";

export class PluginRegistry {
  private plugins = new Map<string, IChainPlugin>();

  register(plugin: IChainPlugin): void {
    if (this.plugins.has(plugin.pluginId)) {
      throw new Error(`Plugin "${plugin.pluginId}" is already registered`);
    }
    this.plugins.set(plugin.pluginId, plugin);
  }

  get(pluginId: string): IChainPlugin | undefined {
    return this.plugins.get(pluginId);
  }

  getOrThrow(pluginId: string): IChainPlugin {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) throw new Error(`Plugin "${pluginId}" is not registered`);
    return plugin;
  }

  list(): IChainPlugin[] {
    return [...this.plugins.values()];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/billing/crypto/plugin/__tests__/registry.test.ts`
Expected: PASS

- [ ] **Step 5: Lint and commit**

```bash
npx biome check --write src/billing/crypto/plugin/
git add src/billing/crypto/plugin/
git commit -m "feat: add PluginRegistry for chain plugin management"
```

---

### Task 3: DB Migration — Add key_rings + address_pool tables

**Files:**
- Create: `drizzle/migrations/0023_key_rings_table.sql`
- Modify: `src/db/schema/crypto.ts`

- [ ] **Step 1: Write migration SQL**

```sql
-- drizzle/migrations/0023_key_rings_table.sql

-- Key rings: decouples key material from payment methods
CREATE TABLE IF NOT EXISTS "key_rings" (
  "id" text PRIMARY KEY,
  "curve" text NOT NULL,
  "derivation_scheme" text NOT NULL,
  "derivation_mode" text NOT NULL DEFAULT 'on-demand',
  "key_material" text NOT NULL DEFAULT '{}',
  "coin_type" integer NOT NULL,
  "account_index" integer NOT NULL DEFAULT 0,
  "created_at" text NOT NULL DEFAULT (now())
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "key_rings_path_unique" ON "key_rings" ("coin_type", "account_index");
--> statement-breakpoint

-- Pre-derived address pool (for Ed25519 chains)
CREATE TABLE IF NOT EXISTS "address_pool" (
  "id" serial PRIMARY KEY,
  "key_ring_id" text NOT NULL REFERENCES "key_rings"("id"),
  "derivation_index" integer NOT NULL,
  "public_key" text NOT NULL,
  "address" text NOT NULL,
  "assigned_to" text,
  "created_at" text NOT NULL DEFAULT (now())
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "address_pool_ring_index" ON "address_pool" ("key_ring_id", "derivation_index");
--> statement-breakpoint

-- Add new columns to payment_methods
ALTER TABLE "payment_methods" ADD COLUMN IF NOT EXISTS "key_ring_id" text REFERENCES "key_rings"("id");
--> statement-breakpoint
ALTER TABLE "payment_methods" ADD COLUMN IF NOT EXISTS "encoding" text;
--> statement-breakpoint
ALTER TABLE "payment_methods" ADD COLUMN IF NOT EXISTS "plugin_id" text;
```

- [ ] **Step 2: Update Drizzle schema**

Add `keyRings` and `addressPool` table definitions to `src/db/schema/crypto.ts`.
Add `keyRingId`, `encoding`, `pluginId` columns to `paymentMethods`.

- [ ] **Step 3: Run migration locally to verify**

```bash
# Start the key server locally or run against test DB
npx vitest run src/billing/crypto/__tests__/address-gen.test.ts
```

- [ ] **Step 4: Lint and commit**

```bash
npx biome check --write src/db/schema/crypto.ts
git add drizzle/migrations/0023_key_rings_table.sql src/db/schema/crypto.ts
git commit -m "feat: add key_rings + address_pool tables, new columns on payment_methods"
```

---

### Task 4: Backfill Migration — Populate key_rings from existing data

**Files:**
- Create: `drizzle/migrations/0024_backfill_key_rings.sql`

- [ ] **Step 1: Write backfill migration**

```sql
-- drizzle/migrations/0024_backfill_key_rings.sql

-- Create key rings from existing payment method xpubs
-- Each unique (coin_type via path_allocations) gets a key ring

-- EVM chains (coin type 60)
INSERT INTO "key_rings" ("id", "curve", "derivation_scheme", "derivation_mode", "key_material", "coin_type", "account_index")
SELECT DISTINCT 'evm-main', 'secp256k1', 'bip32', 'on-demand',
  json_build_object('xpub', pm.xpub)::text,
  pa.coin_type, pa.account_index
FROM path_allocations pa
JOIN payment_methods pm ON pm.id = pa.chain_id
WHERE pa.coin_type = 60
LIMIT 1
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- BTC (coin type 0)
INSERT INTO "key_rings" ("id", "curve", "derivation_scheme", "derivation_mode", "key_material", "coin_type", "account_index")
SELECT DISTINCT 'btc-main', 'secp256k1', 'bip32', 'on-demand',
  json_build_object('xpub', pm.xpub)::text,
  pa.coin_type, pa.account_index
FROM path_allocations pa
JOIN payment_methods pm ON pm.id = pa.chain_id
WHERE pa.coin_type = 0
LIMIT 1
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- LTC (coin type 2)
INSERT INTO "key_rings" ("id", "curve", "derivation_scheme", "derivation_mode", "key_material", "coin_type", "account_index")
SELECT DISTINCT 'ltc-main', 'secp256k1', 'bip32', 'on-demand',
  json_build_object('xpub', pm.xpub)::text,
  pa.coin_type, pa.account_index
FROM path_allocations pa
JOIN payment_methods pm ON pm.id = pa.chain_id
WHERE pa.coin_type = 2
LIMIT 1
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- DOGE (coin type 3)
INSERT INTO "key_rings" ("id", "curve", "derivation_scheme", "derivation_mode", "key_material", "coin_type", "account_index")
SELECT DISTINCT 'doge-main', 'secp256k1', 'bip32', 'on-demand',
  json_build_object('xpub', pm.xpub)::text,
  pa.coin_type, pa.account_index
FROM path_allocations pa
JOIN payment_methods pm ON pm.id = pa.chain_id
WHERE pa.coin_type = 3
LIMIT 1
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- TRON (coin type 195)
INSERT INTO "key_rings" ("id", "curve", "derivation_scheme", "derivation_mode", "key_material", "coin_type", "account_index")
SELECT DISTINCT 'tron-main', 'secp256k1', 'bip32', 'on-demand',
  json_build_object('xpub', pm.xpub)::text,
  pa.coin_type, pa.account_index
FROM path_allocations pa
JOIN payment_methods pm ON pm.id = pa.chain_id
WHERE pa.coin_type = 195
LIMIT 1
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- Backfill payment_methods with key_ring_id, encoding, plugin_id
UPDATE payment_methods SET
  key_ring_id = CASE
    WHEN chain IN ('arbitrum','avalanche','base','base-sepolia','bsc','optimism','polygon','sepolia') THEN 'evm-main'
    WHEN chain = 'bitcoin' THEN 'btc-main'
    WHEN chain = 'litecoin' THEN 'ltc-main'
    WHEN chain = 'dogecoin' THEN 'doge-main'
    WHEN chain = 'tron' THEN 'tron-main'
  END,
  encoding = address_type,
  plugin_id = watcher_type
WHERE key_ring_id IS NULL;
```

- [ ] **Step 2: Commit**

```bash
git add drizzle/migrations/0024_backfill_key_rings.sql
git commit -m "feat: backfill key_rings from existing path_allocations + payment_methods"
```

---

### Task 5: Update PaymentMethodStore to include new fields

**Files:**
- Modify: `src/billing/crypto/payment-method-store.ts`
- Test: existing tests should still pass

- [ ] **Step 1: Add new fields to PaymentMethodRecord**

Add `keyRingId`, `encoding`, `pluginId` to the `PaymentMethodRecord` type and all mapping functions in `payment-method-store.ts`.

- [ ] **Step 2: Run existing tests**

Run: `npx vitest run`
Expected: All existing tests still pass (new fields are nullable during transition)

- [ ] **Step 3: Lint and commit**

```bash
npx biome check --write src/billing/crypto/payment-method-store.ts
git add src/billing/crypto/payment-method-store.ts
git commit -m "feat: add keyRingId, encoding, pluginId to PaymentMethodRecord"
```

---

### Task 6: Export plugin interfaces from platform-core

**Files:**
- Create: `src/billing/crypto/plugin/index.ts`
- Modify: `src/billing/crypto/index.ts`
- Modify: `package.json` (add subpath export)

- [ ] **Step 1: Create plugin barrel export**

```ts
// src/billing/crypto/plugin/index.ts
export type {
  DepositInfo,
  EncodingParams,
  IAddressEncoder,
  IChainPlugin,
  IChainWatcher,
  ICurveDeriver,
  IPriceOracle,
  ISweepStrategy,
  IWatcherCursorStore,
  KeyPair,
  PaymentEvent,
  SweepResult,
  SweeperOpts,
  WatcherOpts,
} from "./interfaces.js";
export { PluginRegistry } from "./registry.js";
```

- [ ] **Step 2: Add subpath export to package.json**

Add to `exports` field:
```json
"./crypto-plugin": {
  "import": "./dist/billing/crypto/plugin/index.js",
  "types": "./dist/billing/crypto/plugin/index.d.ts"
}
```

- [ ] **Step 3: Re-export from main crypto index**

Add to `src/billing/crypto/index.ts`:
```ts
export { PluginRegistry } from "./plugin/index.js";
export type { IChainPlugin, ICurveDeriver, IAddressEncoder, IChainWatcher, ISweepStrategy, PaymentEvent } from "./plugin/index.js";
```

- [ ] **Step 4: Build to verify exports work**

Run: `pnpm build`
Expected: Clean build, `dist/billing/crypto/plugin/` exists

- [ ] **Step 5: Lint and commit**

```bash
npx biome check --write src/billing/crypto/plugin/ src/billing/crypto/index.ts
git add src/billing/crypto/plugin/index.ts src/billing/crypto/index.ts package.json
git commit -m "feat: export plugin interfaces from platform-core/crypto-plugin"
```

---

### Task 7: Integration test — registry + interfaces end-to-end

**Files:**
- Create: `src/billing/crypto/plugin/__tests__/integration.test.ts`

- [ ] **Step 1: Write integration test**

Test that a mock plugin can be registered, watcher created, and poll returns events:

```ts
import { describe, expect, it } from "vitest";
import { PluginRegistry } from "../registry.js";
import type { IChainPlugin, PaymentEvent, WatcherOpts } from "../interfaces.js";

describe("plugin integration — registry → watcher → events", () => {
  it("full lifecycle: register → create watcher → poll → events", async () => {
    const mockEvent: PaymentEvent = {
      chain: "test",
      token: "TEST",
      from: "0xsender",
      to: "0xreceiver",
      rawAmount: "1000",
      amountUsdCents: 100,
      txHash: "0xhash",
      blockNumber: 42,
      confirmations: 6,
      confirmationsRequired: 6,
    };

    const plugin: IChainPlugin = {
      pluginId: "test",
      supportedCurve: "secp256k1",
      encoders: {},
      createWatcher: (_opts: WatcherOpts) => ({
        init: async () => {},
        poll: async () => [mockEvent],
        setWatchedAddresses: () => {},
        getCursor: () => 42,
        stop: () => {},
      }),
      createSweeper: () => ({ scan: async () => [], sweep: async () => [] }),
      version: 1,
    };

    const registry = new PluginRegistry();
    registry.register(plugin);

    const resolved = registry.getOrThrow("test");
    const watcher = resolved.createWatcher({
      rpcUrl: "http://localhost:8545",
      rpcHeaders: {},
      oracle: { getPrice: async () => ({ priceMicros: 3500_000000 }) },
      cursorStore: { get: async () => null, save: async () => {}, getConfirmationCount: async () => null, saveConfirmationCount: async () => {} },
      token: "TEST",
      chain: "test",
      decimals: 18,
      confirmations: 6,
    });

    await watcher.init();
    const events = await watcher.poll();
    expect(events).toHaveLength(1);
    expect(events[0].txHash).toBe("0xhash");
    expect(watcher.getCursor()).toBe(42);
    watcher.stop();
  });
});
```

- [ ] **Step 2: Run test**

Run: `npx vitest run src/billing/crypto/plugin/__tests__/integration.test.ts`
Expected: PASS

- [ ] **Step 3: Lint and commit**

```bash
npx biome check --write src/billing/crypto/plugin/__tests__/
git add src/billing/crypto/plugin/__tests__/integration.test.ts
git commit -m "test: plugin registry integration test — full lifecycle"
```

---

### Task 8: Final verification

- [ ] **Step 1: Run full test suite**

```bash
npx vitest run
```

Expected: All tests pass (existing + new plugin tests)

- [ ] **Step 2: Build**

```bash
pnpm build
```

Expected: Clean build

- [ ] **Step 3: Lint**

```bash
npx biome check src/
```

Expected: No errors

- [ ] **Step 4: Create PR**

```bash
git push origin feat/crypto-plugin-phase1
gh pr create --title "feat: crypto plugin architecture — Phase 1 (interfaces + DB + registry)" --body "..."
```
