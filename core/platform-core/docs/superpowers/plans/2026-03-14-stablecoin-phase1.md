# Stablecoin Phase 1: USDC on Base — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept USDC payments on Base via a self-hosted node, crediting the double-entry ledger with the same invariants as BTCPay.

**Architecture:** An EVM watcher polls a self-hosted Base node (`op-geth`) for ERC-20 `Transfer` events on the USDC contract. Each invoice gets a unique deposit address derived from a master xpub via BIP-44 HD derivation. When a Transfer to a watched address is confirmed, the watcher credits the ledger through the existing `ICryptoChargeRepository` + `ILedger` pattern — identical to the BTCPay webhook handler.

**Tech Stack:** `viem` (EVM library, ABI encoding, log parsing), `@scure/bip32` + `@scure/base` (HD wallet derivation), existing Drizzle schema + double-entry ledger.

**Spec:** `docs/specs/stablecoin-payments.md` (on `docs/stablecoin-spec` branch)

---

## File Map

### New files (platform-core)

| File | Responsibility |
|------|---------------|
| `src/billing/crypto/evm/types.ts` | `ChainConfig`, `TokenConfig`, `EvmPaymentEvent`, `StablecoinCheckoutOpts` |
| `src/billing/crypto/evm/config.ts` | Base chain config, USDC contract address, confirmation depth, token decimals |
| `src/billing/crypto/evm/address-gen.ts` | `deriveDepositAddress(xpub, index)` — BIP-44 HD derivation, no private keys |
| `src/billing/crypto/evm/watcher.ts` | `EvmWatcher` class — polls `eth_getLogs` for Transfer events, tracks cursor, emits settlement |
| `src/billing/crypto/evm/settler.ts` | `settleEvmPayment(deps, event)` — look up charge by deposit address, credit ledger, mark credited |
| `src/billing/crypto/evm/checkout.ts` | `createStablecoinCheckout(deps, opts)` — derive address, store charge, return address + amount |
| `src/billing/crypto/evm/index.ts` | Barrel exports |
| `src/billing/crypto/evm/__tests__/config.test.ts` | Chain/token config tests |
| `src/billing/crypto/evm/__tests__/address-gen.test.ts` | HD derivation tests (known xpub → known addresses) |
| `src/billing/crypto/evm/__tests__/watcher.test.ts` | Mock RPC responses, Transfer event parsing, confirmation counting |
| `src/billing/crypto/evm/__tests__/settler.test.ts` | Settlement logic — idempotency, ledger credit, mark credited |
| `src/billing/crypto/evm/__tests__/checkout.test.ts` | Checkout flow — address derivation, charge creation, min amount |

### Modified files (platform-core)

| File | Change |
|------|--------|
| `src/db/schema/crypto.ts` | Add `chain`, `token`, `deposit_address`, `derivation_index` columns (nullable for BTCPay backward compat) |
| `src/billing/crypto/charge-store.ts` | Add `createStablecoinCharge()`, `getByDepositAddress()`, `getNextDerivationIndex()` to interface + impl |
| `src/billing/crypto/index.ts` | Re-export `./evm/index.js` |
| `drizzle/migrations/0005_stablecoin_columns.sql` | ALTER TABLE add columns + index on deposit_address |
| `package.json` | Add `viem`, `@scure/bip32`, `@scure/base` dependencies |

### New files (wopr-ops)

| File | Change |
|------|--------|
| `docker-compose.local.yml` | Add `op-geth` + `op-node` services (or separate compose file) |
| `RUNBOOK.md` | Base node section: sync, monitoring, troubleshooting |

---

## Chunk 1: Dependencies + Schema Migration

### Task 1: Add npm dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install viem and scure libraries**

```bash
cd /home/tsavo/platform-core
pnpm add viem @scure/bip32 @scure/base
```

- [ ] **Step 2: Verify imports resolve**

```bash
node -e "require('viem'); require('@scure/bip32'); require('@scure/base'); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "deps: add viem, @scure/bip32, @scure/base for stablecoin payments"
```

### Task 2: Schema migration — add stablecoin columns to crypto_charges

**Files:**
- Modify: `src/db/schema/crypto.ts`
- Create: `drizzle/migrations/0005_stablecoin_columns.sql`

- [ ] **Step 1: Add columns to Drizzle schema**

In `src/db/schema/crypto.ts`, add four nullable columns after `filledAmount`:

```typescript
chain: text("chain"),           // e.g. "base", "ethereum"
token: text("token"),           // e.g. "USDC", "USDT", "DAI"
depositAddress: text("deposit_address"),  // HD-derived address for this charge
derivationIndex: integer("derivation_index"),  // HD derivation path index
```

And add an index in the table's index array:

```typescript
index("idx_crypto_charges_deposit_address").on(table.depositAddress),
```

These are nullable because existing BTCPay charges don't have them.

- [ ] **Step 2: Generate the migration**

```bash
npx drizzle-kit generate
```

Verify it creates `drizzle/migrations/0005_stablecoin_columns.sql` with ALTER TABLE statements adding the four columns and the index.

- [ ] **Step 3: Verify migration has statement-breakpoint separators**

Read the generated SQL. Each statement (ALTER TABLE, CREATE INDEX) must be separated by `--\> statement-breakpoint`. PGlite (unit tests) requires this.

- [ ] **Step 4: Run tests to verify migration applies cleanly**

```bash
npx vitest run src/billing/crypto/charge-store.test.ts
```

Expected: existing tests still pass (new columns are nullable, no breaking change).

- [ ] **Step 5: Commit**

```bash
git add src/db/schema/crypto.ts drizzle/
git commit -m "schema: add chain, token, deposit_address, derivation_index to crypto_charges"
```

### Task 3: Extend ICryptoChargeRepository for stablecoin charges

**Files:**
- Modify: `src/billing/crypto/charge-store.ts`
- Modify: `src/billing/crypto/charge-store.test.ts`

- [ ] **Step 1: Write failing tests for new methods**

Add tests to `charge-store.test.ts`:

```typescript
describe("stablecoin charges", () => {
  it("creates a stablecoin charge with chain/token/address", async () => {
    await repo.createStablecoinCharge({
      referenceId: "sc:base:usdc:0x123",
      tenantId: "tenant-1",
      amountUsdCents: 1000,
      chain: "base",
      token: "USDC",
      depositAddress: "0xabc123",
      derivationIndex: 42,
    });
    const charge = await repo.getByReferenceId("sc:base:usdc:0x123");
    expect(charge).not.toBeNull();
    expect(charge!.chain).toBe("base");
    expect(charge!.token).toBe("USDC");
    expect(charge!.depositAddress).toBe("0xabc123");
    expect(charge!.derivationIndex).toBe(42);
  });

  it("looks up charge by deposit address", async () => {
    await repo.createStablecoinCharge({
      referenceId: "sc:base:usdc:0x456",
      tenantId: "tenant-2",
      amountUsdCents: 5000,
      chain: "base",
      token: "USDC",
      depositAddress: "0xdef456",
      derivationIndex: 43,
    });
    const charge = await repo.getByDepositAddress("0xdef456");
    expect(charge).not.toBeNull();
    expect(charge!.tenantId).toBe("tenant-2");
    expect(charge!.amountUsdCents).toBe(5000);
  });

  it("returns null for unknown deposit address", async () => {
    const charge = await repo.getByDepositAddress("0xnonexistent");
    expect(charge).toBeNull();
  });

  it("gets next derivation index (0 when empty)", async () => {
    const idx = await repo.getNextDerivationIndex();
    expect(idx).toBe(0);
  });

  it("gets next derivation index (max + 1)", async () => {
    await repo.createStablecoinCharge({
      referenceId: "sc:1",
      tenantId: "t",
      amountUsdCents: 100,
      chain: "base",
      token: "USDC",
      depositAddress: "0xa",
      derivationIndex: 5,
    });
    const idx = await repo.getNextDerivationIndex();
    expect(idx).toBe(6);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/billing/crypto/charge-store.test.ts
```

Expected: FAIL — methods don't exist yet.

- [ ] **Step 3: Add new fields to CryptoChargeRecord type**

```typescript
export interface CryptoChargeRecord {
  // ... existing fields ...
  chain: string | null;
  token: string | null;
  depositAddress: string | null;
  derivationIndex: number | null;
}
```

- [ ] **Step 4: Add new methods to ICryptoChargeRepository interface**

```typescript
export interface StablecoinChargeInput {
  referenceId: string;
  tenantId: string;
  amountUsdCents: number;
  chain: string;
  token: string;
  depositAddress: string;
  derivationIndex: number;
}

export interface ICryptoChargeRepository {
  // ... existing methods ...
  createStablecoinCharge(input: StablecoinChargeInput): Promise<void>;
  getByDepositAddress(address: string): Promise<CryptoChargeRecord | null>;
  getNextDerivationIndex(): Promise<number>;
}
```

- [ ] **Step 5: Implement methods in DrizzleCryptoChargeRepository**

```typescript
async createStablecoinCharge(input: StablecoinChargeInput): Promise<void> {
  await this.db.insert(cryptoCharges).values({
    referenceId: input.referenceId,
    tenantId: input.tenantId,
    amountUsdCents: input.amountUsdCents,
    status: "New",
    chain: input.chain,
    token: input.token,
    depositAddress: input.depositAddress,
    derivationIndex: input.derivationIndex,
  });
}

async getByDepositAddress(address: string): Promise<CryptoChargeRecord | null> {
  const row = (
    await this.db
      .select()
      .from(cryptoCharges)
      .where(eq(cryptoCharges.depositAddress, address))
  )[0];
  if (!row) return null;
  return this.toRecord(row);
}

async getNextDerivationIndex(): Promise<number> {
  const result = await this.db
    .select({ maxIdx: sql<number>`coalesce(max(${cryptoCharges.derivationIndex}), -1)` })
    .from(cryptoCharges);
  return (result[0]?.maxIdx ?? -1) + 1;
}
```

Also update `getByReferenceId` and `toRecord()` helper to return the new fields.

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx vitest run src/billing/crypto/charge-store.test.ts
```

Expected: ALL pass.

- [ ] **Step 7: Commit**

```bash
git add src/billing/crypto/charge-store.ts src/billing/crypto/charge-store.test.ts
git commit -m "feat: add stablecoin charge methods to ICryptoChargeRepository"
```

---

## Chunk 2: EVM Core — Config, Address Generation, Types

### Task 4: EVM types

**Files:**
- Create: `src/billing/crypto/evm/types.ts`

- [ ] **Step 1: Create types file**

```typescript
/** Supported EVM chains. */
export type EvmChain = "base";

/** Supported stablecoin tokens. */
export type StablecoinToken = "USDC";

/** Chain configuration. */
export interface ChainConfig {
  readonly chain: EvmChain;
  readonly rpcUrl: string;
  readonly confirmations: number;
  readonly blockTimeMs: number;
  readonly chainId: number;
}

/** Token configuration on a specific chain. */
export interface TokenConfig {
  readonly token: StablecoinToken;
  readonly chain: EvmChain;
  readonly contractAddress: `0x${string}`;
  readonly decimals: number;
}

/** Event emitted when a Transfer is detected and confirmed. */
export interface EvmPaymentEvent {
  readonly chain: EvmChain;
  readonly token: StablecoinToken;
  readonly from: string;
  readonly to: string;
  /** Raw token amount (BigInt as string for serialization). */
  readonly rawAmount: string;
  /** USD cents equivalent (integer). */
  readonly amountUsdCents: number;
  readonly txHash: string;
  readonly blockNumber: number;
  readonly logIndex: number;
}

/** Options for creating a stablecoin checkout. */
export interface StablecoinCheckoutOpts {
  tenant: string;
  amountUsd: number;
  chain: EvmChain;
  token: StablecoinToken;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/billing/crypto/evm/types.ts
git commit -m "feat(evm): add stablecoin type definitions"
```

### Task 5: Chain and token configuration

**Files:**
- Create: `src/billing/crypto/evm/config.ts`
- Create: `src/billing/crypto/evm/__tests__/config.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, expect, it } from "vitest";
import { getChainConfig, getTokenConfig, tokenAmountFromCents } from "../config.js";

describe("getChainConfig", () => {
  it("returns Base config", () => {
    const cfg = getChainConfig("base");
    expect(cfg.chainId).toBe(8453);
    expect(cfg.confirmations).toBe(1);
  });

  it("throws on unknown chain", () => {
    expect(() => getChainConfig("solana" as any)).toThrow("Unsupported chain");
  });
});

describe("getTokenConfig", () => {
  it("returns USDC on Base", () => {
    const cfg = getTokenConfig("USDC", "base");
    expect(cfg.decimals).toBe(6);
    expect(cfg.contractAddress).toMatch(/^0x/);
  });
});

describe("tokenAmountFromCents", () => {
  it("converts 1000 cents ($10) to USDC raw amount", () => {
    const raw = tokenAmountFromCents(1000, 6);
    expect(raw).toBe(10_000_000n); // $10 × 10^6
  });

  it("converts 100 cents ($1) to DAI raw amount (18 decimals)", () => {
    const raw = tokenAmountFromCents(100, 18);
    expect(raw).toBe(1_000_000_000_000_000_000n); // $1 × 10^18
  });

  it("rejects non-integer cents", () => {
    expect(() => tokenAmountFromCents(10.5, 6)).toThrow("integer");
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run src/billing/crypto/evm/__tests__/config.test.ts
```

- [ ] **Step 3: Implement config**

```typescript
import type { ChainConfig, EvmChain, StablecoinToken, TokenConfig } from "./types.js";

const CHAINS: Record<EvmChain, ChainConfig> = {
  base: {
    chain: "base",
    rpcUrl: process.env.EVM_RPC_BASE ?? "http://op-geth:8545",
    confirmations: 1,
    blockTimeMs: 2000,
    chainId: 8453,
  },
};

/** USDC on Base (Circle-issued, bridged). */
const TOKENS: Record<`${StablecoinToken}:${EvmChain}`, TokenConfig> = {
  "USDC:base": {
    token: "USDC",
    chain: "base",
    contractAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    decimals: 6,
  },
};

export function getChainConfig(chain: EvmChain): ChainConfig {
  const cfg = CHAINS[chain];
  if (!cfg) throw new Error(`Unsupported chain: ${chain}`);
  return cfg;
}

export function getTokenConfig(token: StablecoinToken, chain: EvmChain): TokenConfig {
  const key = `${token}:${chain}` as const;
  const cfg = TOKENS[key];
  if (!cfg) throw new Error(`Unsupported token ${token} on ${chain}`);
  return cfg;
}

/**
 * Convert USD cents (integer) to token raw amount (BigInt).
 * Stablecoins are 1:1 USD, so $10.00 = 1000 cents = 10 × 10^decimals raw.
 */
export function tokenAmountFromCents(cents: number, decimals: number): bigint {
  if (!Number.isInteger(cents)) throw new Error("cents must be an integer");
  // cents / 100 = dollars, dollars × 10^decimals = raw
  // To avoid floating point: cents × 10^decimals / 100
  return (BigInt(cents) * 10n ** BigInt(decimals)) / 100n;
}

/**
 * Convert token raw amount (BigInt) to USD cents (integer).
 * Inverse of tokenAmountFromCents. Truncates fractional cents.
 */
export function centsFromTokenAmount(rawAmount: bigint, decimals: number): number {
  // raw / 10^decimals = dollars, dollars × 100 = cents
  // To avoid floating point: raw × 100 / 10^decimals
  return Number((rawAmount * 100n) / 10n ** BigInt(decimals));
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/billing/crypto/evm/__tests__/config.test.ts
```

Expected: ALL pass.

- [ ] **Step 5: Commit**

```bash
git add src/billing/crypto/evm/config.ts src/billing/crypto/evm/__tests__/config.test.ts
git commit -m "feat(evm): chain and token config for Base + USDC"
```

### Task 6: HD wallet address derivation

**Files:**
- Create: `src/billing/crypto/evm/address-gen.ts`
- Create: `src/billing/crypto/evm/__tests__/address-gen.test.ts`

- [ ] **Step 1: Write failing tests**

Use a known test xpub and verify deterministic address derivation:

```typescript
import { describe, expect, it } from "vitest";
import { deriveDepositAddress, isValidXpub } from "../address-gen.js";

// BIP-44 test vector xpub (Ethereum path m/44'/60'/0')
// We'll use a well-known test xpub for deterministic tests.
const TEST_XPUB = "xpub6CUGRUonZSQ4TWtTMmzXdrXDtypWKiKrhko4egpiMZbpiaQL2jkwSB1icqYh2cfDfVxdx4df189oLKnC5fSwqPfgyP3hooxujYzAu3fDVmz";

describe("deriveDepositAddress", () => {
  it("derives a valid Ethereum address", () => {
    const addr = deriveDepositAddress(TEST_XPUB, 0);
    expect(addr).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("derives different addresses for different indices", () => {
    const addr0 = deriveDepositAddress(TEST_XPUB, 0);
    const addr1 = deriveDepositAddress(TEST_XPUB, 1);
    expect(addr0).not.toBe(addr1);
  });

  it("is deterministic — same xpub + index = same address", () => {
    const a = deriveDepositAddress(TEST_XPUB, 42);
    const b = deriveDepositAddress(TEST_XPUB, 42);
    expect(a).toBe(b);
  });

  it("returns checksummed address", () => {
    const addr = deriveDepositAddress(TEST_XPUB, 0);
    // Checksummed addresses have mixed case
    expect(addr).not.toBe(addr.toLowerCase());
  });
});

describe("isValidXpub", () => {
  it("accepts valid xpub", () => {
    expect(isValidXpub(TEST_XPUB)).toBe(true);
  });

  it("rejects garbage", () => {
    expect(isValidXpub("not-an-xpub")).toBe(false);
  });

  it("rejects xprv (private key)", () => {
    expect(isValidXpub("xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run src/billing/crypto/evm/__tests__/address-gen.test.ts
```

- [ ] **Step 3: Implement address derivation**

```typescript
import { HDKey } from "@scure/bip32";
import { getAddress, keccak256 } from "viem";

/**
 * Derive a deposit address from an xpub at a given BIP-44 index.
 *
 * Path: xpub / 0 / index (external chain / address index).
 * Returns a checksummed Ethereum address. No private keys involved.
 */
export function deriveDepositAddress(xpub: string, index: number): `0x${string}` {
  const master = HDKey.fromExtendedKey(xpub);
  const child = master.deriveChild(0).deriveChild(index);
  if (!child.publicKey) throw new Error("Failed to derive public key");

  // Ethereum address = last 20 bytes of keccak256(uncompressed pubkey without 04 prefix)
  // viem's publicKeyToAddress handles this, but we need raw uncompressed key
  const uncompressed = uncompressPublicKey(child.publicKey);
  const hash = keccak256(uncompressed.slice(1) as `0x${string}`);
  const addr = `0x${hash.slice(-40)}` as `0x${string}`;
  return getAddress(addr); // checksummed
}

/** Decompress a 33-byte compressed secp256k1 public key to 65-byte uncompressed. */
function uncompressPublicKey(compressed: Uint8Array): Uint8Array {
  // Use @scure/bip32's HDKey which already provides the compressed key.
  // viem can convert compressed → uncompressed via secp256k1.
  // For simplicity, use viem's built-in utility.
  const { secp256k1 } = require("@noble/curves/secp256k1");
  const point = secp256k1.ProjectivePoint.fromHex(compressed);
  return point.toRawBytes(false); // uncompressed (65 bytes)
}

/** Validate that a string is an xpub (not xprv). */
export function isValidXpub(key: string): boolean {
  if (!key.startsWith("xpub")) return false;
  try {
    HDKey.fromExtendedKey(key);
    return true;
  } catch {
    return false;
  }
}
```

Note: `@noble/curves` is a transitive dependency of `@scure/bip32` — no extra install needed. If the `require()` is problematic for ESM, use `import { secp256k1 } from "@noble/curves/secp256k1"` at the top of the file instead. Adjust during implementation based on what the test runner accepts.

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/billing/crypto/evm/__tests__/address-gen.test.ts
```

Expected: ALL pass. If the test xpub doesn't work (wrong derivation path depth), generate a fresh test xpub using `@scure/bip32` in the test setup.

- [ ] **Step 5: Commit**

```bash
git add src/billing/crypto/evm/address-gen.ts src/billing/crypto/evm/__tests__/address-gen.test.ts
git commit -m "feat(evm): HD wallet address derivation from xpub"
```

---

## Chunk 3: EVM Watcher + Settler

### Task 7: EVM watcher — polls for Transfer events

**Files:**
- Create: `src/billing/crypto/evm/watcher.ts`
- Create: `src/billing/crypto/evm/__tests__/watcher.test.ts`

- [ ] **Step 1: Write failing tests**

Test the watcher with a mock RPC transport. Focus on:
- Parsing ERC-20 Transfer event logs
- Tracking block cursor (last processed block)
- Skipping already-processed blocks on restart
- Confirmation counting (waits for N confirmations)
- Extracting `from`, `to`, `value` from log topics/data

```typescript
import { describe, expect, it, vi } from "vitest";
import { EvmWatcher } from "../watcher.js";

// ERC-20 Transfer event signature
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// Mock eth_getLogs response for a USDC Transfer
function mockTransferLog(to: string, amount: bigint, blockNumber: number) {
  return {
    address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    topics: [
      TRANSFER_TOPIC,
      `0x000000000000000000000000${"ab".repeat(20)}`, // from (padded)
      `0x000000000000000000000000${to.slice(2).toLowerCase()}`, // to (padded)
    ],
    data: `0x${amount.toString(16).padStart(64, "0")}`,
    blockNumber: `0x${blockNumber.toString(16)}`,
    transactionHash: "0x" + "ff".repeat(32),
    logIndex: "0x0",
  };
}

describe("EvmWatcher", () => {
  it("parses Transfer log into EvmPaymentEvent", async () => {
    const events: any[] = [];
    const mockRpc = vi.fn()
      .mockResolvedValueOnce(`0x${(100).toString(16)}`) // eth_blockNumber: block 100
      .mockResolvedValueOnce([mockTransferLog("0x" + "cc".repeat(20), 10_000_000n, 99)]); // eth_getLogs

    const watcher = new EvmWatcher({
      chain: "base",
      token: "USDC",
      rpcCall: mockRpc,
      fromBlock: 99,
      onPayment: (evt) => { events.push(evt); },
    });

    await watcher.poll();

    expect(events).toHaveLength(1);
    expect(events[0].amountUsdCents).toBe(1000); // 10 USDC = $10 = 1000 cents
    expect(events[0].to).toMatch(/^0x/);
  });

  it("advances cursor after processing", async () => {
    const mockRpc = vi.fn()
      .mockResolvedValueOnce(`0x${(200).toString(16)}`) // block 200
      .mockResolvedValueOnce([]); // no logs

    const watcher = new EvmWatcher({
      chain: "base",
      token: "USDC",
      rpcCall: mockRpc,
      fromBlock: 100,
      onPayment: vi.fn(),
    });

    await watcher.poll();
    expect(watcher.cursor).toBeGreaterThan(100);
  });

  it("skips blocks not yet confirmed", async () => {
    const events: any[] = [];
    const mockRpc = vi.fn()
      .mockResolvedValueOnce(`0x${(50).toString(16)}`) // current block: 50
      .mockResolvedValueOnce([mockTransferLog("0x" + "dd".repeat(20), 5_000_000n, 50)]); // log at block 50

    // Base needs 1 confirmation, so block 50 is confirmed when current is 51+
    const watcher = new EvmWatcher({
      chain: "base",
      token: "USDC",
      rpcCall: mockRpc,
      fromBlock: 49,
      onPayment: (evt) => { events.push(evt); },
    });

    await watcher.poll();
    // Block 50 with current block 50: needs 1 confirmation → confirmed block = 50 - 1 = 49
    // So block 50 should NOT be processed yet
    expect(events).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run src/billing/crypto/evm/__tests__/watcher.test.ts
```

- [ ] **Step 3: Implement watcher**

```typescript
import { getChainConfig, getTokenConfig, centsFromTokenAmount } from "./config.js";
import type { EvmChain, EvmPaymentEvent, StablecoinToken } from "./types.js";

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

type RpcCall = (method: string, params: unknown[]) => Promise<unknown>;

export interface EvmWatcherOpts {
  chain: EvmChain;
  token: StablecoinToken;
  rpcCall: RpcCall;
  fromBlock: number;
  onPayment: (event: EvmPaymentEvent) => void | Promise<void>;
}

export class EvmWatcher {
  private _cursor: number;
  private readonly chain: EvmChain;
  private readonly token: StablecoinToken;
  private readonly rpc: RpcCall;
  private readonly onPayment: EvmWatcherOpts["onPayment"];
  private readonly confirmations: number;
  private readonly contractAddress: string;
  private readonly decimals: number;

  constructor(opts: EvmWatcherOpts) {
    this.chain = opts.chain;
    this.token = opts.token;
    this.rpc = opts.rpcCall;
    this._cursor = opts.fromBlock;
    this.onPayment = opts.onPayment;

    const chainCfg = getChainConfig(opts.chain);
    const tokenCfg = getTokenConfig(opts.token, opts.chain);
    this.confirmations = chainCfg.confirmations;
    this.contractAddress = tokenCfg.contractAddress.toLowerCase();
    this.decimals = tokenCfg.decimals;
  }

  get cursor(): number {
    return this._cursor;
  }

  /** Poll for new Transfer events. Call on an interval. */
  async poll(): Promise<void> {
    const latestHex = (await this.rpc("eth_blockNumber", [])) as string;
    const latest = parseInt(latestHex, 16);
    const confirmed = latest - this.confirmations;

    if (confirmed < this._cursor) return; // nothing new

    const logs = (await this.rpc("eth_getLogs", [
      {
        address: this.contractAddress,
        topics: [TRANSFER_TOPIC],
        fromBlock: `0x${this._cursor.toString(16)}`,
        toBlock: `0x${confirmed.toString(16)}`,
      },
    ])) as Array<{
      address: string;
      topics: string[];
      data: string;
      blockNumber: string;
      transactionHash: string;
      logIndex: string;
    }>;

    for (const log of logs) {
      const to = "0x" + log.topics[2].slice(26);
      const from = "0x" + log.topics[1].slice(26);
      const rawAmount = BigInt(log.data);
      const amountUsdCents = centsFromTokenAmount(rawAmount, this.decimals);

      const event: EvmPaymentEvent = {
        chain: this.chain,
        token: this.token,
        from,
        to,
        rawAmount: rawAmount.toString(),
        amountUsdCents,
        txHash: log.transactionHash,
        blockNumber: parseInt(log.blockNumber, 16),
        logIndex: parseInt(log.logIndex, 16),
      };

      await this.onPayment(event);
    }

    this._cursor = confirmed + 1;
  }
}

/** Create an RPC caller for a given URL (plain JSON-RPC over fetch). */
export function createRpcCaller(rpcUrl: string): RpcCall {
  let id = 0;
  return async (method: string, params: unknown[]): Promise<unknown> => {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
    });
    if (!res.ok) throw new Error(`RPC ${method} failed: ${res.status}`);
    const data = (await res.json()) as { result?: unknown; error?: { message: string } };
    if (data.error) throw new Error(`RPC ${method} error: ${data.error.message}`);
    return data.result;
  };
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/billing/crypto/evm/__tests__/watcher.test.ts
```

Expected: ALL pass.

- [ ] **Step 5: Commit**

```bash
git add src/billing/crypto/evm/watcher.ts src/billing/crypto/evm/__tests__/watcher.test.ts
git commit -m "feat(evm): Transfer event watcher with confirmation counting"
```

### Task 8: Settler — credits ledger on confirmed payment

**Files:**
- Create: `src/billing/crypto/evm/settler.ts`
- Create: `src/billing/crypto/evm/__tests__/settler.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, expect, it, vi } from "vitest";
import type { EvmPaymentEvent } from "../types.js";
import { settleEvmPayment } from "../settler.js";

const mockEvent: EvmPaymentEvent = {
  chain: "base",
  token: "USDC",
  from: "0xsender",
  to: "0xdeposit",
  rawAmount: "10000000", // 10 USDC
  amountUsdCents: 1000,
  txHash: "0xtx",
  blockNumber: 100,
  logIndex: 0,
};

describe("settleEvmPayment", () => {
  it("credits ledger when charge found and not yet credited", async () => {
    const deps = {
      chargeStore: {
        getByDepositAddress: vi.fn().mockResolvedValue({
          referenceId: "sc:base:usdc:abc",
          tenantId: "tenant-1",
          amountUsdCents: 1000,
          status: "New",
          creditedAt: null,
        }),
        updateStatus: vi.fn().mockResolvedValue(undefined),
        markCredited: vi.fn().mockResolvedValue(undefined),
      },
      creditLedger: {
        hasReferenceId: vi.fn().mockResolvedValue(false),
        credit: vi.fn().mockResolvedValue({}),
      },
      onCreditsPurchased: vi.fn().mockResolvedValue([]),
    };

    const result = await settleEvmPayment(deps as any, mockEvent);

    expect(result.handled).toBe(true);
    expect(result.creditedCents).toBe(1000);
    expect(deps.creditLedger.credit).toHaveBeenCalledOnce();
    expect(deps.chargeStore.markCredited).toHaveBeenCalledOnce();
  });

  it("skips crediting when already credited (idempotent)", async () => {
    const deps = {
      chargeStore: {
        getByDepositAddress: vi.fn().mockResolvedValue({
          referenceId: "sc:base:usdc:abc",
          tenantId: "tenant-1",
          amountUsdCents: 1000,
          status: "Settled",
          creditedAt: "2026-01-01",
        }),
        updateStatus: vi.fn().mockResolvedValue(undefined),
        markCredited: vi.fn().mockResolvedValue(undefined),
      },
      creditLedger: {
        hasReferenceId: vi.fn().mockResolvedValue(true),
        credit: vi.fn().mockResolvedValue({}),
      },
    };

    const result = await settleEvmPayment(deps as any, mockEvent);

    expect(result.handled).toBe(true);
    expect(result.creditedCents).toBe(0);
    expect(deps.creditLedger.credit).not.toHaveBeenCalled();
  });

  it("returns handled:false when no charge found for deposit address", async () => {
    const deps = {
      chargeStore: {
        getByDepositAddress: vi.fn().mockResolvedValue(null),
      },
      creditLedger: { hasReferenceId: vi.fn(), credit: vi.fn() },
    };

    const result = await settleEvmPayment(deps as any, mockEvent);
    expect(result.handled).toBe(false);
  });

  it("credits the charge amount, not the transfer amount (overpayment safe)", async () => {
    const overpaidEvent = { ...mockEvent, amountUsdCents: 2000 }; // sent $20
    const deps = {
      chargeStore: {
        getByDepositAddress: vi.fn().mockResolvedValue({
          referenceId: "sc:x",
          tenantId: "t",
          amountUsdCents: 1000, // charge was for $10
          status: "New",
          creditedAt: null,
        }),
        updateStatus: vi.fn().mockResolvedValue(undefined),
        markCredited: vi.fn().mockResolvedValue(undefined),
      },
      creditLedger: {
        hasReferenceId: vi.fn().mockResolvedValue(false),
        credit: vi.fn().mockResolvedValue({}),
      },
      onCreditsPurchased: vi.fn().mockResolvedValue([]),
    };

    const result = await settleEvmPayment(deps as any, overpaidEvent);
    expect(result.creditedCents).toBe(1000); // charged amount, not transfer amount
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run src/billing/crypto/evm/__tests__/settler.test.ts
```

- [ ] **Step 3: Implement settler**

```typescript
import { Credit } from "../../../credits/credit.js";
import type { ILedger } from "../../../credits/ledger.js";
import type { ICryptoChargeRepository } from "../charge-store.js";
import type { CryptoWebhookResult } from "../types.js";
import type { EvmPaymentEvent } from "./types.js";

export interface EvmSettlerDeps {
  chargeStore: Pick<ICryptoChargeRepository, "getByDepositAddress" | "updateStatus" | "markCredited">;
  creditLedger: Pick<ILedger, "credit" | "hasReferenceId">;
  onCreditsPurchased?: (tenantId: string, ledger: ILedger) => Promise<string[]>;
}

/**
 * Settle an EVM payment event — look up charge by deposit address, credit ledger.
 *
 * Same idempotency pattern as handleCryptoWebhook():
 *   Primary: creditLedger.hasReferenceId() — atomic in ledger transaction
 *   Secondary: chargeStore.markCredited() — advisory
 *
 * Credits the CHARGE amount (not the transfer amount) for overpayment safety.
 */
export async function settleEvmPayment(
  deps: EvmSettlerDeps,
  event: EvmPaymentEvent,
): Promise<CryptoWebhookResult> {
  const { chargeStore, creditLedger } = deps;

  const charge = await chargeStore.getByDepositAddress(event.to);
  if (!charge) {
    return { handled: false, status: "Settled" };
  }

  // Update charge status to Settled.
  await chargeStore.updateStatus(charge.referenceId, "Settled");

  // Idempotency: check if ledger already has this reference.
  const creditRef = `evm:${event.chain}:${event.txHash}:${event.logIndex}`;
  if (await creditLedger.hasReferenceId(creditRef)) {
    return { handled: true, status: "Settled", tenant: charge.tenantId, creditedCents: 0 };
  }

  // Credit the charge amount (NOT the transfer amount — overpayment stays in wallet).
  const creditCents = charge.amountUsdCents;
  await creditLedger.credit(charge.tenantId, Credit.fromCents(creditCents), "purchase", {
    description: `Stablecoin credit purchase (${event.token} on ${event.chain}, tx: ${event.txHash})`,
    referenceId: creditRef,
    fundingSource: "crypto",
  });

  await chargeStore.markCredited(charge.referenceId);

  let reactivatedBots: string[] | undefined;
  if (deps.onCreditsPurchased) {
    reactivatedBots = await deps.onCreditsPurchased(charge.tenantId, creditLedger as ILedger);
    if (reactivatedBots.length === 0) reactivatedBots = undefined;
  }

  return {
    handled: true,
    status: "Settled",
    tenant: charge.tenantId,
    creditedCents: creditCents,
    reactivatedBots,
  };
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/billing/crypto/evm/__tests__/settler.test.ts
```

Expected: ALL pass.

- [ ] **Step 5: Commit**

```bash
git add src/billing/crypto/evm/settler.ts src/billing/crypto/evm/__tests__/settler.test.ts
git commit -m "feat(evm): settler — credits ledger on confirmed stablecoin payment"
```

---

## Chunk 4: Stablecoin Checkout + Barrel Exports

### Task 9: Stablecoin checkout flow

**Files:**
- Create: `src/billing/crypto/evm/checkout.ts`
- Create: `src/billing/crypto/evm/__tests__/checkout.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, expect, it, vi } from "vitest";
import { createStablecoinCheckout, MIN_STABLECOIN_USD } from "../checkout.js";

describe("createStablecoinCheckout", () => {
  const mockChargeStore = {
    getNextDerivationIndex: vi.fn().mockResolvedValue(42),
    createStablecoinCharge: vi.fn().mockResolvedValue(undefined),
  };

  it("derives address and creates charge", async () => {
    const result = await createStablecoinCheckout(
      { chargeStore: mockChargeStore as any, xpub: "xpub6CUGRUonZSQ4TWtTMmzXdrXDtypWKiKrhko4egpiMZbpiaQL2jkwSB1icqYh2cfDfVxdx4df189oLKnC5fSwqPfgyP3hooxujYzAu3fDVmz" },
      { tenant: "t1", amountUsd: 10, chain: "base", token: "USDC" },
    );

    expect(result.depositAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(result.amountRaw).toBe("10000000"); // 10 USDC in raw
    expect(result.chain).toBe("base");
    expect(result.token).toBe("USDC");
    expect(mockChargeStore.createStablecoinCharge).toHaveBeenCalledOnce();
  });

  it("rejects below minimum", async () => {
    await expect(
      createStablecoinCheckout(
        { chargeStore: mockChargeStore as any, xpub: "xpub6CUGRUonZSQ4TWtTMmzXdrXDtypWKiKrhko4egpiMZbpiaQL2jkwSB1icqYh2cfDfVxdx4df189oLKnC5fSwqPfgyP3hooxujYzAu3fDVmz" },
        { tenant: "t1", amountUsd: 5, chain: "base", token: "USDC" },
      ),
    ).rejects.toThrow("Minimum");
  });
});
```

- [ ] **Step 2: Implement checkout**

```typescript
import { Credit } from "../../../credits/credit.js";
import type { ICryptoChargeRepository } from "../charge-store.js";
import { deriveDepositAddress } from "./address-gen.js";
import { getTokenConfig, tokenAmountFromCents } from "./config.js";
import type { StablecoinCheckoutOpts } from "./types.js";

export const MIN_STABLECOIN_USD = 10;

export interface StablecoinCheckoutDeps {
  chargeStore: Pick<ICryptoChargeRepository, "getNextDerivationIndex" | "createStablecoinCharge">;
  xpub: string;
}

export interface StablecoinCheckoutResult {
  depositAddress: string;
  amountRaw: string;
  amountUsd: number;
  chain: string;
  token: string;
  referenceId: string;
}

export async function createStablecoinCheckout(
  deps: StablecoinCheckoutDeps,
  opts: StablecoinCheckoutOpts,
): Promise<StablecoinCheckoutResult> {
  if (opts.amountUsd < MIN_STABLECOIN_USD) {
    throw new Error(`Minimum payment amount is $${MIN_STABLECOIN_USD}`);
  }

  const tokenCfg = getTokenConfig(opts.token, opts.chain);
  const amountUsdCents = Credit.fromDollars(opts.amountUsd).toCentsRounded();
  const rawAmount = tokenAmountFromCents(amountUsdCents, tokenCfg.decimals);

  const derivationIndex = await deps.chargeStore.getNextDerivationIndex();
  const depositAddress = deriveDepositAddress(deps.xpub, derivationIndex);

  const referenceId = `sc:${opts.chain}:${opts.token.toLowerCase()}:${depositAddress.toLowerCase()}`;

  await deps.chargeStore.createStablecoinCharge({
    referenceId,
    tenantId: opts.tenant,
    amountUsdCents,
    chain: opts.chain,
    token: opts.token,
    depositAddress: depositAddress.toLowerCase(),
    derivationIndex,
  });

  return {
    depositAddress,
    amountRaw: rawAmount.toString(),
    amountUsd: opts.amountUsd,
    chain: opts.chain,
    token: opts.token,
    referenceId,
  };
}
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run src/billing/crypto/evm/__tests__/checkout.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/billing/crypto/evm/checkout.ts src/billing/crypto/evm/__tests__/checkout.test.ts
git commit -m "feat(evm): stablecoin checkout — derive address, create charge"
```

### Task 10: Barrel exports

**Files:**
- Create: `src/billing/crypto/evm/index.ts`
- Modify: `src/billing/crypto/index.ts`

- [ ] **Step 1: Create EVM barrel**

```typescript
export { getChainConfig, getTokenConfig, tokenAmountFromCents, centsFromTokenAmount } from "./config.js";
export { deriveDepositAddress, isValidXpub } from "./address-gen.js";
export { EvmWatcher, createRpcCaller } from "./watcher.js";
export type { EvmWatcherOpts } from "./watcher.js";
export { settleEvmPayment } from "./settler.js";
export type { EvmSettlerDeps } from "./settler.js";
export { createStablecoinCheckout, MIN_STABLECOIN_USD } from "./checkout.js";
export type { StablecoinCheckoutDeps, StablecoinCheckoutResult } from "./checkout.js";
export type {
  ChainConfig,
  EvmChain,
  EvmPaymentEvent,
  StablecoinCheckoutOpts,
  StablecoinToken,
  TokenConfig,
} from "./types.js";
```

- [ ] **Step 2: Add re-export to main crypto barrel**

In `src/billing/crypto/index.ts`, add at the end:

```typescript
export * from "./evm/index.js";
```

- [ ] **Step 3: Verify build compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/billing/crypto/evm/index.ts src/billing/crypto/index.ts
git commit -m "feat(evm): barrel exports for stablecoin module"
```

---

## Chunk 5: Infrastructure — Docker + RUNBOOK

### Task 11: Base node Docker services (wopr-ops)

**Files:**
- Modify: `~/wopr-ops/docker-compose.local.yml` (or create a separate `docker-compose.base-node.yml`)
- Modify: `~/wopr-ops/RUNBOOK.md`

- [ ] **Step 1: Add op-geth + op-node services to docker-compose**

Add to wopr-ops docker-compose (or create overlay):

```yaml
  op-geth:
    image: us-docker.pkg.dev/oplabs-tools-artifacts/images/op-geth:latest
    volumes:
      - base-geth-data:/data
    ports:
      - "8545:8545"
      - "8546:8546"
    command: >
      --datadir=/data
      --http --http.addr=0.0.0.0 --http.port=8545
      --http.api=eth,net,web3
      --ws --ws.addr=0.0.0.0 --ws.port=8546
      --ws.api=eth,net,web3
      --rollup.sequencerhttp=https://mainnet-sequencer.base.org
      --rollup.historicalrpc=https://mainnet.base.org
      --syncmode=snap
    restart: unless-stopped

  op-node:
    image: us-docker.pkg.dev/oplabs-tools-artifacts/images/op-node:latest
    depends_on: [op-geth]
    command: >
      --l1=ws://geth:8546
      --l2=http://op-geth:8551
      --network=base-mainnet
      --rpc.addr=0.0.0.0 --rpc.port=9545
    restart: unless-stopped
```

And add volume:

```yaml
volumes:
  base-geth-data:
```

Note: the `--l1` endpoint needs an Ethereum L1 node or a provider for the derivation pipe. For production, this should be our own geth instance. For initial setup, can use a public L1 endpoint temporarily. Document this trade-off in RUNBOOK.

- [ ] **Step 2: Add RUNBOOK section for Base node**

Add to `~/wopr-ops/RUNBOOK.md` under a new `### Self-hosted Base node (stablecoin payments)` heading:

Document:
- What it does (L2 node for stablecoin payment detection)
- Disk requirements (~50GB, grows slowly)
- Sync time (initial: 2-6 hours, then real-time)
- How to check sync status: `curl -s http://localhost:8545 -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"eth_syncing","id":1}'`
- L1 dependency (op-node needs L1 RPC for derivation)
- Monitoring: compare local block number vs Base block explorer
- Troubleshooting: if op-geth falls behind, restart; if disk full, prune

- [ ] **Step 3: Commit in wopr-ops**

```bash
cd ~/wopr-ops
jj new && jj describe "feat: add Base node (op-geth + op-node) for stablecoin payments"
# ... add files ...
jj commit
```

### Task 12: Base node in paperclip-platform local dev compose

**Files:**
- Modify: `~/paperclip-platform/docker-compose.local.yml`

- [ ] **Step 1: Add op-geth service for local dev**

For local dev, use Anvil (Foundry's local node) instead of a real Base node. Anvil is lighter and can fork Base mainnet:

```yaml
  anvil:
    image: ghcr.io/foundry-rs/foundry:latest
    entrypoint: ["anvil"]
    command: >
      --fork-url https://mainnet.base.org
      --host 0.0.0.0
      --port 8545
    ports:
      - "8545:8545"
```

Or if we want to test against a real Base node locally, add the full op-geth stack. For Phase 1, Anvil fork is sufficient for integration tests.

Add `EVM_RPC_BASE=http://anvil:8545` to platform environment.
Add `EVM_XPUB` to `.env.local.example`.

- [ ] **Step 2: Commit**

---

## Chunk 6: Integration Testing

### Task 13: End-to-end stablecoin flow test

**Files:**
- Create: `src/billing/crypto/evm/__tests__/e2e-flow.test.ts`

- [ ] **Step 1: Write integration test**

Test the full flow with mocked RPC:
1. `createStablecoinCheckout()` → get deposit address
2. Simulate Transfer event to that address
3. `settleEvmPayment()` → credits ledger
4. Verify charge is marked credited
5. Verify ledger balance increased

This test uses real charge-store (PGlite) + real ledger, mocked RPC only.

- [ ] **Step 2: Run full test suite**

```bash
npx vitest run src/billing/crypto/
```

Expected: ALL pass (existing BTCPay tests + new EVM tests).

- [ ] **Step 3: Commit**

```bash
git add src/billing/crypto/evm/__tests__/e2e-flow.test.ts
git commit -m "test(evm): end-to-end stablecoin checkout → watcher → settlement flow"
```

### Task 14: Run CI gate

- [ ] **Step 1: Full CI gate**

```bash
pnpm lint && pnpm format && pnpm build && pnpm test
```

(Skip `swiftformat` and `pnpm protocol:gen` — no Swift or protocol changes.)

All must pass. Fix any issues found.

- [ ] **Step 2: Final commit if lint/format made changes**

---

## Execution Order Summary

| Task | What | Where | Depends on |
|------|------|-------|-----------|
| 1 | npm deps | platform-core | — |
| 2 | Schema migration | platform-core | 1 |
| 3 | Charge store methods | platform-core | 2 |
| 4 | EVM types | platform-core | — |
| 5 | Chain/token config | platform-core | 4 |
| 6 | Address derivation | platform-core | 1 |
| 7 | EVM watcher | platform-core | 5 |
| 8 | Settler | platform-core | 3, 5 |
| 9 | Checkout flow | platform-core | 3, 5, 6 |
| 10 | Barrel exports | platform-core | 4-9 |
| 11 | Docker services | wopr-ops | — (independent) |
| 12 | Local dev compose | paperclip-platform | 11 |
| 13 | E2E test | platform-core | all above |
| 14 | CI gate | platform-core | 13 |

Tasks 1, 4, 11 can run in parallel. Tasks 5, 6 can run in parallel after 4. Task 7, 8, 9 can run in parallel after their deps.
