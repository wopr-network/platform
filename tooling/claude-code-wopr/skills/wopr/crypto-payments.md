---
name: wopr:crypto-payments
description: Use when adding a new cryptocurrency or token to the payment system, debugging payment watchers, modifying sweep scripts, wiring settlers, or understanding the crypto checkout flow. Covers ERC-20 tokens, native coins (ETH/BTC/LTC), HD wallet derivation, Chainlink oracles, watcher architecture, and the full add-a-coin checklist.
---

# Crypto Payments — Full Stack Reference

## Architecture Overview

```
User → billing.checkout(methodId, amountUsd)
       → payment_methods table (DB lookup)
       → oracle price (if native asset)
       → HD address derivation (xpub + index)
       → deposit address shown in UI

Watcher (polling) → detects transfer → settler → Credit.fromCents() → double-entry ledger
```

**Three repos involved:**

| Repo | What it owns |
|------|-------------|
| `platform-core` | Watchers, settlers, checkout logic, oracle, address derivation, DB schema, sweep script |
| `paperclip-platform` | tRPC router (`billing.checkout`), watcher startup loop, settler wiring |
| `platform-ui-core` | Checkout UI (`BuyCryptoCreditPanel`), admin panel (`/admin/payment-methods`) |

## Adding a New Coin — Decision Tree

```dot
digraph add_coin {
  "New coin?" [shape=diamond];
  "ERC-20 on Base?" [shape=diamond];
  "Native on existing chain?" [shape=diamond];
  "New chain, UTXO-based?" [shape=diamond];
  "New chain, EVM-based?" [shape=diamond];

  "Admin panel only" [shape=box, style=filled, fillcolor="#d4edda"];
  "New EthWatcher instance + oracle feed" [shape=box];
  "New watcher class + node + derivation path" [shape=box];
  "New EVM node + watcher instances" [shape=box];
  "Custom integration" [shape=box];

  "New coin?" -> "ERC-20 on Base?";
  "ERC-20 on Base?" -> "Admin panel only" [label="yes"];
  "ERC-20 on Base?" -> "Native on existing chain?" [label="no"];
  "Native on existing chain?" -> "New EthWatcher instance + oracle feed" [label="yes (Base)"];
  "Native on existing chain?" -> "New chain, UTXO-based?" [label="no"];
  "New chain, UTXO-based?" -> "New watcher class + node + derivation path" [label="yes (BTC-like)"];
  "New chain, UTXO-based?" -> "New chain, EVM-based?" [label="no"];
  "New chain, EVM-based?" -> "New EVM node + watcher instances" [label="yes"];
  "New chain, EVM-based?" -> "Custom integration" [label="no (Solana etc)"];
}
```

## Scenario 1: Add ERC-20 on Base (zero code)

1. Go to `/admin/payment-methods`
2. Add row: `id`, `type: erc20`, `token`, `chain: base`, `contract_address`, `decimals`, `rpc_url`, `xpub`, `enabled: true`
3. Done. The watcher startup loop detects the new method on next refresh (60s) and creates a watcher.

**All fields are in the admin panel** — `rpc_url`, `oracle_address`, `xpub`, `contract_address`, `confirmations`. No env vars, no deploys.

**Gotcha:** Verify the contract address is correct (Base mainnet, not Ethereum mainnet). Wrong address = watcher silently misses transfers.
**Gotcha:** Methods on the same chain share the same `rpc_url` and `xpub`. Duplicate values are fine — the watcher groups by chain internally.

## Scenario 2: Add ERC-20 on a New EVM Chain

**Checklist — every file you touch:**

| Step | File(s) | What to do |
|------|---------|-----------|
| 1. Run a node | `docker-compose.local.yml` | Add the chain's execution client (e.g., `op-geth` for Optimism, `bor` for Polygon) |
| 2. Env var | `.env.local` | Add `EVM_RPC_<CHAIN>=http://node:8545` |
| 3. DB row | Admin panel or migration | `{ type: "erc20", chain: "<chain>", contract_address: "0x..." }` |
| 4. Watcher instance | `paperclip-platform` startup | Create `new EvmWatcher({ rpcUrl: env.EVM_RPC_<CHAIN>, ... })` |
| 5. Settler wiring | `paperclip-platform` startup | Wire `onPayment` → `settleEvmPayment` |
| 6. Sweep script | `wopr-ops/scripts/sweep-stablecoins.ts` | Add the chain's RPC + token contracts to sweep config |

**Gotcha:** The sweep script currently only sweeps Base. Adding a new chain means adding a new RPC endpoint AND token list to the sweep loop. Don't forget gas funding on the new chain too.

## Scenario 3: Add Native Coin on Existing EVM Chain (e.g., another L2 native token)

Same as Scenario 2, plus:

| Step | File(s) | What to do |
|------|---------|-----------|
| Oracle feed | `platform-core/src/billing/crypto/oracle/chainlink.ts` | Add Chainlink feed address for `<TOKEN>/USD` on that chain |
| DB row | Admin panel | `{ type: "native", token: "<TOKEN>", chain: "<chain>", decimals: 18 }` |
| EthWatcher | `paperclip-platform` startup | Create `new EthWatcher({ rpcUrl, ... })` for native transfers |

**Gotcha:** Chainlink feed addresses differ per chain. ETH/USD on Base ≠ ETH/USD on Ethereum mainnet. Check https://data.chain.link for the correct address.

## Scenario 4: Add UTXO Chain (Litecoin, Dogecoin, etc.)

Bitcoin forks share the same RPC API (`listsinceblock`, `getblockcount`). The `BtcWatcher` class can be reused.

| Step | File(s) | What to do |
|------|---------|-----------|
| 1. Run a node | `docker-compose.local.yml` | Add `litecoind` / `dogecoind` container |
| 2. Derivation path | BIP-44 spec | New coin type: LTC=2, DOGE=3. Path: `m/44'/<coin>'/0'` |
| 3. Generate xpub | From the shared mnemonic | `HDKey.fromMasterSeed(seed).derive("m/44'/<coin>'/0'").publicExtendedKey` |
| 4. Env var | `.env.local` | `<COIN>_RPC_URL`, `<COIN>_XPUB` |
| 5. Address derivation | `platform-core/src/billing/crypto/btc/address-gen.ts` | May need chain-specific address encoding (LTC uses different version bytes) |
| 6. Watcher | New or parameterized `BtcWatcher` | Same RPC calls, different RPC URL |
| 7. Settler | New settler or parameterized | `creditRef = "<coin>:txid"` |
| 8. Oracle | Chainlink or other | Need `<COIN>/USD` price feed |
| 9. DB row | Admin panel | `{ type: "native", token: "<COIN>", chain: "<chain>", decimals: 8 }` |
| 10. Sweep | New sweep script or extend existing | UTXO sweep is different from EVM — construct raw tx spending all UTXOs |

**Gotcha — address encoding:** BTC uses `Base58Check` with version byte `0x00` (mainnet). LTC uses `0x30`. Dogecoin uses `0x1e`. The `address-gen.ts` in platform-core is BTC-specific — you'll need to parameterize the version byte or write a chain-specific derivation function.

**Gotcha — UTXO sweep:** EVM sweep signs one `transfer()` per address. UTXO sweep constructs a transaction spending multiple UTXOs. Completely different code. Don't try to extend `sweep-stablecoins.ts` — write a separate UTXO sweep script.

## Scenario 5: Non-UTXO, Non-EVM Chain (Solana, etc.)

Requires a fully custom integration:
- New watcher class (Solana uses WebSocket subscriptions, not polling)
- New address derivation (Solana uses Ed25519, not secp256k1)
- New derivation path (`m/44'/501'/0'` for Solana)
- New sweep script
- New settler with chain-specific `creditRef`

## Key Components Reference

### Payment Method Registry

**Table:** `payment_methods` in platform-core DB schema (`src/db/schema/crypto.ts`)

| Column | Purpose |
|--------|---------|
| `id` | PK, e.g. `usdc:base` |
| `type` | `erc20` or `native` |
| `token` | Display name |
| `chain` | Network identifier |
| `contract_address` | ERC-20 only (null for native) |
| `decimals` | Token precision |
| `enabled` | Runtime toggle |
| `rpc_url` | Chain node RPC endpoint (watcher reads this at startup) |
| `oracle_address` | Chainlink feed contract (null for stablecoins — 1:1 USD) |
| `xpub` | HD wallet extended public key for deposit address derivation |
| `confirmations` | Required block confirmations |

**Store:** `DrizzlePaymentMethodStore` implements `IPaymentMethodStore`

### HD Wallet Derivation

**One mnemonic → multiple xpubs → unlimited deposit addresses**

```
Mnemonic (24 words, encrypted at rest, NEVER on server)
  ├── m/44'/0'/0'   → BTC xpub   → BTC deposit addresses
  ├── m/44'/60'/0'  → EVM xpub   → ERC-20 + ETH deposit addresses
  ├── m/44'/2'/0'   → LTC xpub   → (if added)
  └── m/44'/501'/0' → SOL xpub   → (if added)
```

**Server only has xpubs.** Cannot sign. Cannot steal funds. Deposit address index = charge row ID.

**Address derivation code:**
- EVM: `platform-core/src/billing/crypto/evm/address-gen.ts`
- BTC: `platform-core/src/billing/crypto/btc/address-gen.ts`

### Chainlink Oracle

**File:** `platform-core/src/billing/crypto/oracle/chainlink.ts`

Reads `latestRoundData()` via `eth_call`. No API keys. 8 decimal precision.

**Adding a new feed:**
1. Find the feed address at https://data.chain.link for the correct chain
2. Set `oracle_address` on the payment method row (admin panel or DB)
3. The watcher startup loop passes `oracle_address` to `ChainlinkOracle` as `feedAddresses` override
4. Staleness guard: rejects prices older than 1 hour by default

**Conversion functions** (`platform-core/src/billing/crypto/oracle/convert.ts`):
- `centsToNative(amountCents, priceCents, decimals)` → BigInt raw amount
- `nativeToCents(rawAmount, priceCents, decimals)` → integer cents

### Watchers

| Watcher | How it polls | Cursor storage |
|---------|-------------|----------------|
| `EvmWatcher` | `eth_getLogs` (Transfer events) | Block number in `watcher_cursors` |
| `EthWatcher` | `eth_getBlockByNumber` (scan txs) | Block number in `watcher_cursors` |
| `BtcWatcher` | `listsinceblock` (bitcoind RPC) | Block hash in `watcher_cursors` + txid in `watcher_processed` |

**All cursors persist to DB** — no in-memory state survives restart. EVM watcher checkpoints per-block (not per-range).

**Gotcha:** `watcher_processed` table is only needed for BTC because `listsinceblock` can return the same txid across calls. EVM watchers use block cursor ranges which are inherently non-overlapping.

### Settlers

All settlers follow the same pattern:
1. Look up charge by deposit address → `"Invalid"` if not found
2. Check `creditRef` uniqueness (e.g. `erc20:base:0xtxhash`)
3. `Credit.fromCents(charge.amountUsdCents)` → nanodollars → double-entry journal
4. Mark charge as credited

**CRITICAL:** Credits are in **nanodollars** (1 cent = 10,000,000 nanodollars). `amountUsdCents` in the charge table is **integer cents**. `Credit.fromCents()` handles the conversion. NEVER multiply cents by hand.

### Sweep Script

**File:** `wopr-ops/scripts/sweep-stablecoins.ts`

**3-phase ETH-first protocol (solves gas bootstrap):**
1. Sweep ETH deposits → treasury gets ETH (self-funded gas)
2. Fund gas from treasury → each ERC-20 deposit gets ~65k gas worth of ETH
3. Sweep ERC-20s → all tokens swept to treasury

**Gotcha — chicken and egg:** If treasury is empty, you can't fund gas for ERC-20 sweeps. That's why ETH sweeps first — ETH deposits pay their own gas.

**Gotcha — adding a new ERC-20:** Add the token's contract address + decimals to the sweep script's token list. The script scans all configured tokens across all deposit addresses.

**Gotcha — adding a new chain:** The sweep script is Base-only. A new EVM chain needs its own RPC endpoint in the sweep config, its own gas funding phase, and its own token list.

**Gotcha — UTXO chains:** UTXO sweep is fundamentally different (construct raw tx, not ERC-20 `transfer()`). Don't try to extend this script for BTC/LTC.

**Mnemonic handling:** Piped from encrypted file via stdin. NEVER as CLI arg, NEVER in shell history, NEVER in env var.

```bash
openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -d \
  -pass pass:<passphrase> -in "/mnt/g/My Drive/paperclip-wallet.enc" \
  | EVM_RPC_BASE=http://localhost:8545 SWEEP_DRY_RUN=false npx tsx scripts/sweep-stablecoins.ts
```

## Universal Gotchas (All Coins)

- **BigInt precision:** `Number(BigInt(wei))` loses precision above ~0.009 ETH. Always use BigInt division for display: `whole = wei / 10n**18n`, `frac = (wei % 10n**18n).toString().padStart(18, '0').slice(0, 6)`
- **Integer math only:** All money math is integer. Cents for USD, raw units for crypto. No floats. Ever.
- **Double-entry ledger:** Every credit has a matching debit. `Credit.fromCents()` handles this. Don't bypass it.
- **Idempotency:** `creditRef` must be unique per settlement. Duplicate `creditRef` = no double-credit. Format: `<type>:<chain>:<txhash>`
- **Confirmations:** Configurable per payment method. Don't credit before confirmed. The watcher subtracts `confirmations` from latest block to get the safe scanning range.
- **xpub is public:** Safe in env vars, logs, repos. The mnemonic is the secret.
- **Contract address per chain:** USDC on Base (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`) ≠ USDC on Ethereum mainnet (`0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`). Always verify.
- **Gas on L2 is negligible:** ~$0.001 per tx on Base. Don't over-engineer gas estimation. On L1 Ethereum, gas matters — plan accordingly.
- **platform-ui-core targets below ES2020:** Use `BigInt("1000000000000000000")` not `10n ** 18n`. BigInt literals require ES2020+.
- **Deposit addresses stored lowercase:** `createStablecoinCharge` lowercases before INSERT. Settlers lookup with lowercased addresses from log topics. Never store checksummed addresses.
- **Anvil fork mode hangs on `eth_getLogs` from Docker:** Topic-filtered log queries go upstream to Base RPC. Use local Anvil (no `--fork-url`) for E2E testing. Deploy mock ERC-20 with `forge create --broadcast` + `anvil_setCode`.
- **Migration timestamps must be monotonic:** Drizzle uses `max(created_at)` to determine applied migrations. Non-monotonic timestamps cause it to skip later migrations.
- **Payment method `rpc_url` must be set in DB:** Migration seeds methods but NOT RPC URLs. Set via admin panel or SQL after first deploy.
- **`@sentry/node` required:** platform-core 1.28+ imports it. Add to paperclip-platform if missing.
- **BTC `rpc_url` format:** `http://user:pass@host:port` — credentials parsed from URL, not separate env vars.
