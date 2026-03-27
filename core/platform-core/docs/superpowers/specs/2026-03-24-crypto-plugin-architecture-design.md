# Crypto Plugin Architecture

**Date:** 2026-03-24
**Status:** Approved
**Problem:** Adding new blockchain curves (Ed25519 for Solana/TON) requires hacking into hardcoded secp256k1 assumptions across 6+ files. The system conflates curve, derivation, and encoding into a single `address_type` column.
**Solution:** Plugin-based architecture where each chain is an independent npm package implementing standard interfaces. Platform-core defines interfaces only.

## Key Derivation Model

Two derivation models depending on the curve's capabilities:

### secp256k1 chains (BTC, ETH, DOGE, LTC, TRX, etc.)
BIP-32 supports public-key-only child derivation. The pay server holds an **xpub** (no private key). Addresses are derived on demand. Mnemonic never touches the server.

### Ed25519 chains (Solana, TON, etc.)
SLIP-0010 Ed25519 only supports **hardened** derivation — child public keys cannot be derived from a parent public key alone. The mnemonic MUST NOT be on the server.

**Solution: Pre-derived address pool.** The sweep CLI (which has the mnemonic) pre-generates N addresses at known derivation indices and uploads them to the key server with their public key as a commitment proof. The key server:

1. Receives `(index, publicKey, address)` tuples from the CLI
2. Validates: re-encodes `publicKey` → address using the chain's encoder, confirms it matches
3. Stores validated addresses in the pool
4. Hands them out to charges on demand, recording which index was assigned

The derivation is still **deterministic and provable** — the sweep CLI can always re-derive the private key at any index. The key server can verify any address without the private key.

**Pool replenishment:**
```bash
openssl enc ... -d | npx @wopr-network/crypto-sweep replenish --chain solana --count 100
```

The `key_rings` table stores the derivation mode:

| `derivation_mode` | Behavior |
|---|---|
| `"on-demand"` | secp256k1 — derive from xpub at request time |
| `"pool"` | Ed25519 — draw from pre-derived address pool |

## Core Interfaces (platform-core)

Platform-core becomes the interface package. It defines what a chain plugin must implement but contains no chain-specific code.

### PaymentEvent
The contract between plugins and platform-core.
```ts
interface PaymentEvent {
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
```

### ICurveDeriver
Derives child public keys from key material. Implemented by KeyRing.
```ts
interface ICurveDeriver {
  derivePublicKey(chainIndex: number, addressIndex: number): Uint8Array;
  getCurve(): "secp256k1" | "ed25519";
}
```

For secp256k1: implemented using xpub + BIP-32 non-hardened derivation.
For Ed25519: NOT used on the server. Only used in the sweep CLI which has the mnemonic. The server uses the pre-derived pool instead.

### IAddressEncoder
Pure function — public key bytes to address string.
```ts
interface IAddressEncoder {
  encode(publicKey: Uint8Array, params: EncodingParams): string;
  encodingType(): string;
}

interface EncodingParams {
  hrp?: string;      // bech32: "bc", "ltc", "tb"
  version?: string;  // p2pkh/keccak-b58check: "0x1e", "0x41"
}
```

### IChainWatcher
Detects payments at watched addresses.
```ts
interface IChainWatcher {
  init(): Promise<void>;
  poll(): Promise<PaymentEvent[]>;
  setWatchedAddresses(addresses: string[]): void;
  getCursor(): number;
  stop(): void;
}
```

Oracle/pricing: the watcher receives an `IPriceOracle` at construction time (via `WatcherOpts`). The plugin calls `oracle.getPrice(token)` to convert raw amounts to USD cents. Price conversion is the plugin's responsibility — platform-core provides the oracle.

### ISweepStrategy
Scans balances and broadcasts sweep transactions. **Only used by the sweep CLI, never by the running key server.**
```ts
interface ISweepStrategy {
  scan(keys: KeyPair[], treasury: string): Promise<DepositInfo[]>;
  sweep(keys: KeyPair[], treasury: string, dryRun: boolean): Promise<SweepResult[]>;
}
```

### IChainPlugin
Bundles everything for a chain. The plugin does not hold a single deriver instance — it receives key rings at watcher/sweeper creation time.
```ts
interface IChainPlugin {
  pluginId: string;
  supportedCurve: "secp256k1" | "ed25519";
  encoders: Record<string, IAddressEncoder>;
  createWatcher(opts: WatcherOpts): IChainWatcher;
  createSweeper(opts: SweeperOpts): ISweepStrategy;
  version: number; // interface version for compatibility
}

interface WatcherOpts {
  rpcUrl: string;
  rpcHeaders: Record<string, string>;
  oracle: IPriceOracle;
  cursorStore: IWatcherCursorStore;
  token: string;
  contractAddress?: string;
  decimals: number;
  confirmations: number;
}
```

## DB Schema

### New: `key_rings` table

| Column | Type | Description |
|--------|------|-------------|
| `id` | text PK | e.g. `"btc-main"`, `"sol-main"` |
| `curve` | text | `"secp256k1"`, `"ed25519"` |
| `derivation_scheme` | text | `"bip32"`, `"slip0010"` |
| `derivation_mode` | text | `"on-demand"` (xpub) or `"pool"` (pre-derived) |
| `key_material` | text | JSON: `{ xpub: "xpub6..." }` for on-demand, `{}` for pool |
| `coin_type` | integer | BIP-44 coin type (0, 2, 3, 60, 195, 501, etc.) |
| `account_index` | integer | BIP-44 account (usually 0) |
| `created_at` | text | timestamp |

**Unique constraint:** `(coin_type, account_index)` — prevents two key rings from claiming the same derivation path. Replaces `path_allocations`.

### New: `address_pool` table (Ed25519 chains)

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial PK | auto-increment |
| `key_ring_id` | text FK | → key_rings.id |
| `derivation_index` | integer | BIP-44 address index |
| `public_key` | text | hex-encoded public key (commitment proof) |
| `address` | text | encoded address string |
| `assigned_to` | text NULL | charge ID (null = available) |
| `created_at` | text | timestamp |

**Unique constraint:** `(key_ring_id, derivation_index)` — no duplicate indices.

### Modified: `payment_methods`

- Drop: `xpub`, `address_type`, `watcher_type`
- Add: `key_ring_id` (FK → key_rings.id)
- Add: `encoding` (text — encoder plugin ID, e.g. `"bech32"`, `"base58-solana"`)
- Add: `plugin_id` (text — chain plugin ID, e.g. `"evm"`, `"solana"`)
- Keep: `encoding_params` (scoped to encoder only)
- Keep: `rpc_url`, `rpc_headers`, `contract_address`, `decimals`, `confirmations`, etc.

### Removed: `path_allocations`

Replaced by `key_rings` unique constraint on `(coin_type, account_index)`.

## Plugin Monorepo

Single npm package: `@wopr-network/crypto-plugins`. One version, one CI, one install.

```
crypto-plugins/
  src/
    evm/           # ETH, Base, Arbitrum, Polygon, Optimism, Avalanche, BSC
    bitcoin/       # BTC (uses shared/utxo)
    litecoin/      # LTC (uses shared/utxo)
    dogecoin/      # DOGE (uses shared/utxo)
    tron/          # TRX + TRC-20 (T-address ↔ hex conversion)
    solana/        # SOL + SPL tokens (Ed25519)
    shared/        # UTXO common (bitcoind RPC, watcher, sweep), test helpers
    index.ts       # barrel export of all plugins
  package.json     # peer dep on @wopr-network/platform-core
```

| Plugin | Curve | Subpath | Chains |
|--------|-------|---------|--------|
| `evm` | secp256k1 | `@wopr-network/crypto-plugins/evm` | ETH + all EVM L1/L2s |
| `bitcoin` | secp256k1 | `@wopr-network/crypto-plugins/bitcoin` | BTC |
| `litecoin` | secp256k1 | `@wopr-network/crypto-plugins/litecoin` | LTC |
| `dogecoin` | secp256k1 | `@wopr-network/crypto-plugins/dogecoin` | DOGE |
| `tron` | secp256k1 | `@wopr-network/crypto-plugins/tron` | TRX + TRC-20 |
| `solana` | ed25519 | `@wopr-network/crypto-plugins/solana` | SOL + SPL |

Platform-core exports interfaces as a peer dependency:
```
@wopr-network/platform-core/crypto-plugin
```

## Plugin Registry

Explicit imports in the key-server entry point:

```ts
import { evmPlugin } from "@wopr-network/crypto-plugins/evm";
import { bitcoinPlugin } from "@wopr-network/crypto-plugins/bitcoin";
import { solanaPlugin } from "@wopr-network/crypto-plugins/solana";

const registry = new PluginRegistry();
registry.register(evmPlugin);
registry.register(bitcoinPlugin);
registry.register(solanaPlugin);
```

## Startup Flow

1. Read `key_rings` from DB → instantiate `ICurveDeriver` per on-demand ring
2. Read `payment_methods` from DB → resolve plugin by `plugin_id`
3. For each enabled method, call `plugin.createWatcher(opts)` with key ring's deriver (on-demand) or pool addresses (pool mode) + method's RPC config + oracle
4. Start poll loops (watcher service is lifecycle manager: start/stop/poll interval)

## Unified Sweep CLI

Package: `@wopr-network/crypto-sweep`

### Sweep mode (default)
1. Read mnemonic from stdin
2. Fetch enabled payment methods from chain server (`GET /chains`)
3. Group by key ring → derive private keys per curve
4. For each chain, load sweep plugin, call `scan()`
5. Print summary (dry run by default)
6. If `SWEEP_DRY_RUN=false`, call `sweep()` for each chain

### Replenish mode (Ed25519 pools)
1. Read mnemonic from stdin
2. Derive N addresses at next available indices
3. Upload `(index, publicKey, address)` tuples to key server
4. Key server validates and stores in `address_pool`

```bash
# Sweep all chains
openssl enc ... -d | npx @wopr-network/crypto-sweep

# Replenish Solana address pool
openssl enc ... -d | npx @wopr-network/crypto-sweep replenish --chain solana --count 100
```

No per-chain env vars. RPC URLs and headers come from the chain server.

## Adding a New Chain

### Existing chain type (e.g. XRP — secp256k1)
1. Add `src/xrp/` to `@wopr-network/crypto-plugins` with encoder + watcher + sweeper
2. Add subpath export, bump version, publish
3. Add `registry.register(xrpPlugin)` to key-server entry point
4. `npm update @wopr-network/crypto-plugins`
5. Insert `key_ring` row + `payment_method` row in DB
6. Restart

### New curve (e.g. Solana — Ed25519)
Same as above, plus:
- Replenish pool: `openssl enc ... -d | npx @wopr-network/crypto-sweep replenish --chain solana --count 200`

No code changes to platform-core for either path.

## Client API

**Zero changes.** Existing endpoints unchanged:

- `POST /address` — `{ chain: "SOL:solana" }` → `{ address, index }`
- `POST /charges` — `{ chain: "SOL:solana", amountUsd: 5 }` → `{ chargeId, address }`
- `GET /chains` — new chains appear automatically
- Webhooks — `{ chargeId, status, txHash }` — unchanged

Only change: admin `POST /admin/chains` takes `key_ring_id` + `encoding` + `plugin_id` instead of `address_type` + `watcher_type` + `xpub`.

## Migration Path

### Phase 1 — Interfaces + registry (platform-core)
- Define all interfaces (`IChainPlugin`, `ICurveDeriver`, `IAddressEncoder`, `IChainWatcher`, `ISweepStrategy`)
- Create `PluginRegistry`
- DB migration 1: add `key_rings` table, add `address_pool` table, add new columns to `payment_methods`
- Backfill: create key_ring rows from existing xpub + address_type data, set `key_ring_id` + `encoding` + `plugin_id` on existing payment_methods
- DB migration 2: drop old columns (`xpub`, `address_type`, `watcher_type`), drop `path_allocations`

### Phase 2 — Extract existing chains into `@wopr-network/crypto-plugins` monorepo
- New repo: `wopr-network/crypto-plugins`
- `src/evm/` — from current `evm/watcher.ts`, `evm/eth-watcher.ts`
- `src/shared/utxo/` — shared bitcoind RPC, UTXO watcher, sweep base
- `src/bitcoin/`, `src/litecoin/`, `src/dogecoin/` — thin configs on shared/utxo
- `src/tron/` — from current tron code (address conversion internal)
- `src/shared/test-helpers/` — mock RPC, test fixtures
- All existing behavior preserved, just restructured
- One npm package, one version, subpath exports per chain

### Phase 3 — Unified sweep CLI
- Sweep + replenish modes live in `@wopr-network/crypto-plugins/sweep` (same monorepo, separate entrypoint)
- Replaces `sweep-stablecoins.ts` and `sweep-tron.ts`

### Phase 4 — New chains
- `src/solana/` in crypto-plugins — first Ed25519 chain, proves pool model
- Then TON, XRP, etc. — each is a new directory + subpath export + version bump

Each phase is independently deployable. Phase 1+2 is a refactor with no behavior change. Phase 3 replaces scripts. Phase 4 is new functionality.

## Testing

Every chain plugin must include:
- **Sweep key parity test** — derived address == mnemonic-derived private key address (for on-demand: xpub test; for pool: index + pubkey → address test)
- **Known test vector** — at least one address verified against external tooling (e.g. TronLink, Phantom, Electrum)
- **Watcher unit test** — mock RPC responses, verify `PaymentEvent` output matches expected fields
- **Encoder unit test** — known pubkey → known address
- **Integration test** — full pipeline: `PluginRegistry → createWatcher → poll → PaymentEvent → handlePayment` with mock RPC
- **Pool validation test** (Ed25519 only) — uploaded `(index, pubkey, address)` re-validates correctly; tampered tuples are rejected
