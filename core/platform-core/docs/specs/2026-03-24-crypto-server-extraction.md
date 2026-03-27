# Crypto Server Extraction

> Extract the pay server from platform-core into `@wopr-network/platform-crypto-server`.

## Problem

The chain box (167.71.118.221 / pay.wopr.bot) runs `node dist/billing/crypto/key-server-entry.js` from a full platform-core install. Platform-core includes auth, fleet, tRPC, Stripe, email, product config — none of which the pay server uses. This means:

- ~150MB install for ~2,000 lines of server code
- 40+ transitive dependencies for a service that needs ~5
- Every platform-core publish triggers a chain box redeploy
- The server and client code are entangled in the same directory

## Design Principle

The pay server does one thing: **helps you get paid in crypto**. It is a standalone service that any project can use — not coupled to the WOPR platform. Address derivation, charge creation, payment watching, webhook delivery. That's it. Credits, billing, tenant accounts — those are platform concerns handled by platform-core after receiving a webhook.

## Current Architecture

```
UI → platform-core (CryptoServiceClient, HTTP) → chain server (Hono, same platform-core package)
crypto-plugins → platform-core (plugin interfaces)
```

Platform-core already has the client/server split at the code level:
- **Client:** `client.ts` (CryptoServiceClient), `unified-checkout.ts` — used by products
- **Server:** `key-server.ts`, `key-server-entry.ts`, watchers, stores, oracles, address-gen — runs on chain box
- **Glue:** `btc/settler.ts`, `evm/settler.ts`, `btc/checkout.ts`, `evm/checkout.ts`, `evm/eth-settler.ts`, `evm/eth-checkout.ts` — bridge between payment events and platform-core's credit ledger

The extraction makes this a packaging boundary.

## Target Architecture

```
UI → platform-core (CryptoServiceClient, HTTP) → chain server (@wopr-network/platform-crypto-server)
chain server → webhook HTTP → platform-core (payment confirmed → credit account)
crypto-plugins → @wopr-network/platform-crypto-server (plugin interfaces)
```

Products don't change. Platform-core keeps the client + ledger glue. The server becomes its own package + Docker image.

## What Moves to platform-crypto-server

### Server code (from `src/billing/crypto/`)

| File | Purpose |
|------|---------|
| `key-server-entry.ts` | Standalone boot |
| `key-server.ts` | Hono routes (POST /address, /charges, /chains, etc.) |
| `charge-store.ts` | DrizzleCryptoChargeRepository |
| `cursor-store.ts` | DrizzleWatcherCursorStore |
| `payment-method-store.ts` | DrizzlePaymentMethodStore |
| `address-gen.ts` | HD key derivation (BIP-44) |
| `watcher-service.ts` | Legacy chain watchers (BTC, ETH, EVM stablecoins) |
| `plugin-watcher-service.ts` | Plugin-based watchers |
| `oracle/*` | Chainlink, CoinGecko, composite, fixed oracles + convert utils |
| `btc/watcher.ts` | BTC watcher |
| `btc/types.ts` | BTC types |
| `btc/config.ts` | BTC config |
| `evm/watcher.ts` | EVM stablecoin watcher |
| `evm/eth-watcher.ts` | Native ETH watcher |
| `evm/types.ts` | EVM types |
| `evm/config.ts` | EVM config |
| `tron/address-convert.ts` | Tron hex/base58 address conversion |
| `plugin/interfaces.ts` | IChainPlugin, IAddressEncoder, etc. |
| `plugin/registry.ts` | PluginRegistry |

### DB schema (from `src/db/schema/crypto.ts`)

Tables owned by the pay server:
- `crypto_charges`
- `payment_methods`
- `watcher_cursors`
- `watcher_processed`
- `derived_addresses`
- `path_allocations`
- `webhook_deliveries`
- `key_rings`
- `address_pool`

### Tests that move

- `__tests__/key-server.test.ts`
- `__tests__/watcher-service.test.ts`
- `__tests__/address-gen.test.ts`
- `__tests__/webhook-confirmations.test.ts`
- `plugin/__tests__/*`
- `btc/__tests__/*` (watcher tests only)
- `evm/__tests__/*` (watcher tests only)
- `tron/__tests__/*`
- `oracle/__tests__/*`

## What Stays in platform-core

### Client code (products import this)

| File | Purpose |
|------|---------|
| `client.ts` | `CryptoServiceClient` + `loadCryptoConfig()` + client types |
| `unified-checkout.ts` | Checkout orchestration via CryptoServiceClient |
| `index.ts` | Re-exports client + types (updated to drop server exports) |

### Ledger glue (bridges payment webhooks → credit ledger)

| File | Purpose |
|------|---------|
| `key-server-webhook.ts` | Webhook handler — receives payment confirmations, credits tenant via `Credit`/`ILedger` |
| `btc/settler.ts` | BTC payment → credit ledger (imports `Credit`, `ILedger`) |
| `btc/checkout.ts` | BTC checkout flow (imports `Credit`) |
| `evm/settler.ts` | EVM stablecoin payment → credit ledger |
| `evm/eth-settler.ts` | Native ETH payment → credit ledger |
| `evm/checkout.ts` | EVM checkout flow |
| `evm/eth-checkout.ts` | ETH checkout flow |
| `types.ts` | `CryptoCharge`, `CryptoChargeStatus`, `CryptoCheckoutOpts` |

### Tests that stay

- `__tests__/unified-checkout.test.ts`
- `__tests__/cents-credits-boundary.test.ts`
- settler/checkout tests in `btc/__tests__/` and `evm/__tests__/`

### Barrel file split

`btc/index.ts` and `evm/index.ts` currently re-export both server code (watchers) and client code (settlers, checkouts, config, types). After extraction:
- **New package:** `btc/index.ts` and `evm/index.ts` export only watchers + types + config
- **Platform-core:** `btc/index.ts` and `evm/index.ts` export only settlers + checkouts + types (drop watcher re-exports)

### Cleanup (dead BTCPay types to remove)

- `CryptoWebhookPayload`, `CryptoBillingConfig`, `CryptoWebhookResult`, `mapBtcPayEventToStatus()` in `types.ts` — BTCPay-era artifacts, no longer used.

## New Package Structure

```
platform-crypto-server/
  src/
    entry.ts                    ← standalone boot
    server.ts                   ← Hono routes
    stores/
      charge-store.ts
      cursor-store.ts
      payment-method-store.ts
    address-gen.ts
    watchers/
      watcher-service.ts
      plugin-watcher-service.ts
    oracle/
      chainlink.ts
      coingecko.ts
      composite.ts
      fixed.ts
      convert.ts
      types.ts
      index.ts
    chains/
      btc/
        watcher.ts
        types.ts
        config.ts
      evm/
        watcher.ts
        eth-watcher.ts
        types.ts
        config.ts
      tron/
        address-convert.ts
    plugin/
      interfaces.ts             ← IChainPlugin, IAddressEncoder, etc.
      registry.ts               ← PluginRegistry
      index.ts
    db/
      schema.ts                 ← 9 crypto tables (extracted from platform-core)
      index.ts                  ← CryptoDb type (replaces PlatformDb/DrizzleDb)
    drizzle/
      migrations/
        0000_baseline.sql       ← CREATE TABLE IF NOT EXISTS for all 9 tables + indexes
        meta/_journal.json
  drizzle.config.ts
  Dockerfile
  package.json
  tsconfig.json
  vitest.config.ts
  biome.json
```

## Dependencies

```json
{
  "dependencies": {
    "@hono/node-server": "^1.x",
    "@noble/curves": "^2.0.1",
    "@noble/hashes": "^2.0.1",
    "@scure/base": "^1.x",
    "@scure/bip32": "^2.0.1",
    "@wopr-network/crypto-plugins": "^1.x",
    "drizzle-orm": "^0.x",
    "hono": "^4.x",
    "pg": "^8.x",
    "viem": "^2.x"
  },
  "devDependencies": {
    "@biomejs/biome": "^2.x",
    "drizzle-kit": "^0.x",
    "typescript": "^6.x",
    "vitest": "^4.x"
  }
}
```

~10 runtime deps vs platform-core's 40+.

## Migration Strategy

### DB Schema

The chain box DB already has the crypto tables (created by platform-core migrations). The new package starts with a **baseline migration** using `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` for all 9 tables. This is:
- A no-op on the existing chain box DB
- A complete setup for fresh deployments

### DB Type Alias

The stores import two different type aliases (`DrizzleDb` and `PlatformDb`) from platform-core. The new package defines a single `CryptoDb` type in `db/index.ts` and all stores use it. The `entry.ts` passes `drizzle(pool, { schema })` using only the crypto schema subset — not the full platform-core schema bundle.

### Repo + CI/CD

- **Repo:** `wopr-network/platform-crypto-server`
- **Docker image:** `ghcr.io/wopr-network/platform-crypto-server`
- **CI:** biome lint → tsc build → vitest → publish npm + Docker (`runs-on: self-hosted`)
- **Deploy:** SSH to 167.71.118.221, pull image, recreate container

### Cutover Steps

1. Create `wopr-network/platform-crypto-server` repo
2. Move server files, adjust imports (relative paths → local, `PlatformDb`/`DrizzleDb` → `CryptoDb`)
3. Extract crypto tables from `src/db/schema/crypto.ts` into `db/schema.ts`
4. Write baseline migration with `IF NOT EXISTS` for all 9 tables + indexes
5. Update `entry.ts` to use crypto-only schema (not full platform-core schema bundle)
6. Add Dockerfile (node:24-alpine, ~50MB image vs current ~500MB+)
7. CI green: lint + build + test
8. Publish npm + Docker image
9. Deploy to chain box, verify Hono API responds identically
10. Smoke test: create charge, poll status, verify watcher detects payment
11. Remove server files from platform-core's `billing/crypto/`
12. Keep settlers/checkouts in platform-core (they import `Credit`/`ILedger`)
13. Update platform-core's `billing/crypto/index.ts` to only export client + settler code
14. Remove `./crypto-plugin` export from platform-core `package.json`
15. Publish platform-core (minor bump — pre-1.0, breaking change in 0.x is minor per semver)
16. Update crypto-plugins: `@wopr-network/platform-crypto-server/plugin` replaces `@wopr-network/platform-core/crypto-plugin`
17. Publish crypto-plugins

### Rollback

If the new image fails on the chain box:
1. `docker compose pull && docker compose up -d` with the old platform-core image
2. The DB hasn't changed — baseline migration was all `IF NOT EXISTS`
3. Revert platform-core deletion PR
4. If platform-core was already published to npm, revert-publish or pin products to pre-extraction version

## Types Boundary

**In platform-crypto-server (server-side):**
- Plugin interfaces: `IChainPlugin`, `IChainWatcher`, `IAddressEncoder`, `ICurveDeriver`, `PaymentEvent`, `WatcherOpts`, `SweeperOpts`, `ISweepStrategy`, `IWatcherCursorStore`, `IPriceOracle`, `KeyPair`, `DepositInfo`, `SweepResult`, `EncodingParams`
- `PluginRegistry` class
- Store interfaces: `ICryptoChargeRepository`, `IPaymentMethodStore`
- Internal types: `CryptoPaymentState`, `BtcPaymentEvent`, `EthPaymentEvent`, `EvmPaymentEvent`, `EvmChain`, `StablecoinToken`
- Subpath export: `@wopr-network/platform-crypto-server/plugin` for crypto-plugins

**In platform-core (client-side):**
- `CryptoServiceClient` class
- `CryptoServiceConfig`, `DeriveAddressResult`, `CreateChargeResult`, `ChargeStatus`, `ChainInfo`
- `loadCryptoConfig()`
- `CryptoCharge`, `CryptoChargeStatus`, `CryptoCheckoutOpts` (from `types.ts`, used by unified-checkout)
- Settlers: `Credit`, `ILedger` imports from platform-core's own credits module

**The HTTP API (JSON request/response shapes) is the contract.** No shared types package needed. The pay server is a standalone service that any project can use.
