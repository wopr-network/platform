# Crypto Server Extraction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the crypto pay server from platform-core into `@wopr-network/platform-crypto-server` — a standalone, lightweight package that deploys to the chain box.

**Architecture:** Move server-side files (Hono routes, watchers, stores, oracles, address-gen, plugin interfaces) into a new repo with its own Drizzle schema. Platform-core keeps the HTTP client (`CryptoServiceClient`) and ledger glue (settlers/checkouts). The HTTP API is the contract — no shared types package.

**Tech Stack:** Hono, Drizzle ORM, PostgreSQL, @noble/curves, @scure/bip32, viem, vitest, biome

**Spec:** `docs/specs/2026-03-24-crypto-server-extraction.md`

---

## File Map

### New files (platform-crypto-server repo)

| File | Source (in platform-core) | Purpose |
|------|--------------------------|---------|
| `src/entry.ts` | `src/billing/crypto/key-server-entry.ts` | Standalone boot |
| `src/server.ts` | `src/billing/crypto/key-server.ts` | Hono routes |
| `src/stores/charge-store.ts` | `src/billing/crypto/charge-store.ts` | Drizzle charge repo |
| `src/stores/cursor-store.ts` | `src/billing/crypto/cursor-store.ts` | Watcher cursor persistence |
| `src/stores/payment-method-store.ts` | `src/billing/crypto/payment-method-store.ts` | Payment method CRUD |
| `src/address-gen.ts` | `src/billing/crypto/address-gen.ts` | BIP-44 HD key derivation |
| `src/watchers/watcher-service.ts` | `src/billing/crypto/watcher-service.ts` | Legacy watchers |
| `src/watchers/plugin-watcher-service.ts` | `src/billing/crypto/plugin-watcher-service.ts` | Plugin-based watchers |
| `src/oracle/chainlink.ts` | `src/billing/crypto/oracle/chainlink.ts` | On-chain oracle |
| `src/oracle/coingecko.ts` | `src/billing/crypto/oracle/coingecko.ts` | API fallback oracle |
| `src/oracle/composite.ts` | `src/billing/crypto/oracle/composite.ts` | Multi-source oracle |
| `src/oracle/fixed.ts` | `src/billing/crypto/oracle/fixed.ts` | Fixed price (stablecoins) |
| `src/oracle/convert.ts` | `src/billing/crypto/oracle/convert.ts` | Price conversion utils |
| `src/oracle/types.ts` | `src/billing/crypto/oracle/types.ts` | IPriceOracle interface |
| `src/oracle/index.ts` | `src/billing/crypto/oracle/index.ts` | Barrel export |
| `src/chains/btc/watcher.ts` | `src/billing/crypto/btc/watcher.ts` | BTC watcher |
| `src/chains/btc/types.ts` | `src/billing/crypto/btc/types.ts` | BTC types |
| `src/chains/btc/config.ts` | `src/billing/crypto/btc/config.ts` | BTC config |
| `src/chains/evm/watcher.ts` | `src/billing/crypto/evm/watcher.ts` | EVM stablecoin watcher |
| `src/chains/evm/eth-watcher.ts` | `src/billing/crypto/evm/eth-watcher.ts` | Native ETH watcher |
| `src/chains/evm/types.ts` | `src/billing/crypto/evm/types.ts` | EVM types |
| `src/chains/evm/config.ts` | `src/billing/crypto/evm/config.ts` | EVM config |
| `src/chains/tron/address-convert.ts` | `src/billing/crypto/tron/address-convert.ts` | Tron hex/b58 conversion |
| `src/plugin/interfaces.ts` | `src/billing/crypto/plugin/interfaces.ts` | IChainPlugin etc. |
| `src/plugin/registry.ts` | `src/billing/crypto/plugin/registry.ts` | PluginRegistry |
| `src/plugin/index.ts` | `src/billing/crypto/plugin/index.ts` | Barrel export |
| `src/db/schema.ts` | `src/db/schema/crypto.ts` | 9 crypto tables |
| `src/db/index.ts` | NEW | CryptoDb type alias |
| `drizzle/migrations/0000_baseline.sql` | NEW | CREATE TABLE IF NOT EXISTS |
| `drizzle/migrations/meta/_journal.json` | NEW | Migration journal |
| `Dockerfile` | NEW | Lightweight alpine image |
| `package.json` | NEW | Package manifest |
| `tsconfig.json` | NEW | TS config |
| `drizzle.config.ts` | NEW | Drizzle config |
| `vitest.config.ts` | NEW | Test config |
| `biome.json` | NEW | Linter config |

### Modified files (platform-core)

| File | Change |
|------|--------|
| `src/billing/crypto/index.ts` | Remove server exports, keep client + settlers + webhook handler |
| `src/billing/crypto/btc/index.ts` | Remove watcher exports, keep settler + checkout + config + types |
| `src/billing/crypto/evm/index.ts` | Remove watcher exports, keep settler + checkout + config + types |
| `package.json` | Remove `./crypto-plugin` export |

### Deleted files (platform-core)

All server-side files that moved to the new package (see "New files" table above).

---

## Task 1: Create repo scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `biome.json`, `vitest.config.ts`, `drizzle.config.ts`

- [ ] **Step 1: Create the GitHub repo**

```bash
gh repo create wopr-network/platform-crypto-server --public --clone
cd platform-crypto-server
```

- [ ] **Step 2: Write package.json**

```json
{
  "name": "@wopr-network/platform-crypto-server",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/entry.js",
  "types": "dist/entry.d.ts",
  "exports": {
    ".": "./dist/entry.js",
    "./plugin": {
      "import": "./dist/plugin/index.js",
      "types": "./dist/plugin/index.d.ts"
    }
  },
  "bin": {
    "crypto-server": "dist/entry.js"
  },
  "scripts": {
    "build": "tsc",
    "lint": "biome check src/",
    "format": "biome format --write src/",
    "test": "vitest run",
    "start": "node dist/entry.js"
  },
  "dependencies": {
    "@hono/node-server": "^1.14.0",
    "@noble/curves": "^2.0.1",
    "@noble/hashes": "^2.0.1",
    "@scure/base": "^1.2.4",
    "@scure/bip32": "^2.0.1",
    "@wopr-network/crypto-plugins": "^1.0.1",
    "drizzle-orm": "^0.44.2",
    "hono": "^4.7.10",
    "pg": "^8.16.0",
    "viem": "^2.30.0"
  },
  "devDependencies": {
    "@biomejs/biome": "^2.4.8",
    "@types/pg": "^8.15.4",
    "@types/node": "^25.5.0",
    "drizzle-kit": "^0.31.3",
    "typescript": "^6.0.2",
    "vitest": "^4.1.1"
  },
  "publishConfig": {
    "access": "public"
  },
  "release": {
    "extends": "@wopr-network/semantic-release-config"
  }
}
```

- [ ] **Step 3: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Write biome.json**

Copy from `~/crypto-plugins/biome.json` — same org conventions.

- [ ] **Step 5: Write vitest.config.ts**

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { globals: true } });
```

- [ ] **Step 6: Write drizzle.config.ts**

```ts
import { defineConfig } from "drizzle-kit";
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
});
```

- [ ] **Step 7: Install dependencies and commit**

```bash
pnpm install
git add -A
git commit -m "chore: scaffold platform-crypto-server repo"
```

---

## Task 2: DB schema + baseline migration

**Files:**
- Create: `src/db/schema.ts`, `src/db/index.ts`, `drizzle/migrations/0000_baseline.sql`, `drizzle/migrations/meta/_journal.json`

- [ ] **Step 1: Write `src/db/schema.ts`**

Copy the 9 table definitions from `~/platform-core/src/db/schema/crypto.ts` verbatim. Remove the file-level imports that reference platform-core internals — only import from `drizzle-orm` and `drizzle-orm/pg-core`.

Tables: `cryptoCharges`, `watcherCursors`, `paymentMethods`, `pathAllocations`, `webhookDeliveries`, `derivedAddresses`, `watcherProcessed`, `keyRings`, `addressPool`.

- [ ] **Step 2: Write `src/db/index.ts`**

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import type pg from "pg";
import * as schema from "./schema.js";

export type CryptoDb = ReturnType<typeof drizzle<typeof schema>>;

export function createDb(pool: pg.Pool): CryptoDb {
  return drizzle(pool, { schema });
}

export { schema };
```

- [ ] **Step 3: Write baseline migration `drizzle/migrations/0000_baseline.sql`**

Hand-write `CREATE TABLE IF NOT EXISTS` for all 9 tables with all columns, indexes, and constraints matching the Drizzle schema exactly. Use `IF NOT EXISTS` on every `CREATE TABLE`, `CREATE INDEX`, and `CREATE UNIQUE INDEX`.

Reference: `~/platform-core/drizzle/migrations/` for the exact SQL column types and index definitions that are currently in production.

- [ ] **Step 4: Write migration journal**

```json
{
  "version": "7",
  "dialect": "postgresql",
  "entries": [
    {
      "idx": 0,
      "version": "7",
      "when": 1711324800000,
      "tag": "0000_baseline",
      "breakpoints": true
    }
  ]
}
```

- [ ] **Step 5: Verify schema compiles**

```bash
pnpm build
```

Expected: clean build, `dist/db/schema.js` and `dist/db/index.js` emitted.

- [ ] **Step 5b: Verify baseline migration SQL is valid (if local DB available)**

```bash
psql $DATABASE_URL -f drizzle/migrations/0000_baseline.sql
```

Expected: all `CREATE TABLE IF NOT EXISTS` succeed. On existing chain DB this is a no-op.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add crypto DB schema with baseline migration"
```

---

## Task 3: Plugin interfaces

**Files:**
- Create: `src/plugin/interfaces.ts`, `src/plugin/registry.ts`, `src/plugin/index.ts`

- [ ] **Step 1: Copy plugin interfaces**

Copy `~/platform-core/src/billing/crypto/plugin/interfaces.ts` verbatim. No imports to change — it's self-contained (zero external deps).

- [ ] **Step 2: Copy PluginRegistry**

Copy `~/platform-core/src/billing/crypto/plugin/registry.ts`. Update import path:
- `"./interfaces.js"` stays the same (relative within plugin/).

- [ ] **Step 3: Copy barrel export**

Copy `~/platform-core/src/billing/crypto/plugin/index.ts`. Paths stay the same.

- [ ] **Step 4: Verify build**

```bash
pnpm build
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add chain plugin interfaces and registry"
```

---

## Task 4: Oracle + address-gen + tron

**Files:**
- Create: `src/oracle/*`, `src/address-gen.ts`, `src/chains/tron/address-convert.ts`

- [ ] **Step 1: Copy oracle directory**

Copy all 7 files from `~/platform-core/src/billing/crypto/oracle/`. No import path changes needed — all imports are relative within `oracle/` or from `drizzle-orm`.

Files: `types.ts`, `chainlink.ts`, `coingecko.ts`, `composite.ts`, `fixed.ts`, `convert.ts`, `index.ts`.

- [ ] **Step 2: Copy address-gen.ts**

Copy `~/platform-core/src/billing/crypto/address-gen.ts`. No import changes — all deps are external packages (`@noble/curves`, `@noble/hashes`, `@scure/base`, `@scure/bip32`, `viem`).

- [ ] **Step 3: Copy tron address-convert.ts**

Copy `~/platform-core/src/billing/crypto/tron/address-convert.ts`. No import changes — uses `@noble/hashes` and `@scure/base`.

- [ ] **Step 4: Verify build**

```bash
pnpm build
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add oracle implementations, address-gen, tron utils"
```

---

## Task 5: Stores

**Files:**
- Create: `src/stores/charge-store.ts`, `src/stores/cursor-store.ts`, `src/stores/payment-method-store.ts`

- [ ] **Step 1: Copy charge-store.ts**

Copy from `~/platform-core/src/billing/crypto/charge-store.ts`. Fix imports:
- `"../../db/index.js"` → `"../db/index.js"` (use `CryptoDb` instead of `PlatformDb`)
- `"../../db/schema/crypto.js"` → `"../db/schema.js"`
- `"./types.js"` → define `CryptoCharge`, `CryptoChargeStatus`, `CryptoPaymentState` locally or create a `src/types.ts`

Replace `PlatformDb` with `CryptoDb` in all type annotations.

- [ ] **Step 2: Copy cursor-store.ts**

Same pattern: fix DB import path, schema import path, replace `PlatformDb` → `CryptoDb`.

- [ ] **Step 3: Copy payment-method-store.ts**

Same pattern.

- [ ] **Step 4: Create `src/types.ts`**

Copy the server-relevant types from `~/platform-core/src/billing/crypto/types.ts`:
- `CryptoChargeStatus` (the union type)
- `CryptoPaymentState` (interface)
- `CryptoCharge` (interface)

Do NOT copy the dead BTCPay types (`CryptoWebhookPayload`, `CryptoBillingConfig`, etc.).

- [ ] **Step 5: Verify build**

```bash
pnpm build
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add Drizzle stores (charges, cursors, payment methods)"
```

---

## Task 6: Chain watchers (BTC + EVM)

**Files:**
- Create: `src/chains/btc/watcher.ts`, `src/chains/btc/types.ts`, `src/chains/btc/config.ts`
- Create: `src/chains/evm/watcher.ts`, `src/chains/evm/eth-watcher.ts`, `src/chains/evm/types.ts`, `src/chains/evm/config.ts`

- [ ] **Step 1: Copy BTC watcher files**

Copy `watcher.ts`, `types.ts`, `config.ts` from `~/platform-core/src/billing/crypto/btc/`. Fix imports in `watcher.ts`:
- `"../cursor-store.js"` → `"../../stores/cursor-store.js"`
- `"../oracle/convert.js"` → `"../../oracle/convert.js"`
- `"../oracle/types.js"` → `"../../oracle/types.js"`

`types.ts` and `config.ts` have no cross-directory imports — copy verbatim.

Do NOT copy `settler.ts` or `checkout.ts` — they stay in platform-core.

- [ ] **Step 2: Copy EVM watcher files**

Copy `watcher.ts`, `eth-watcher.ts`, `types.ts`, `config.ts` from `~/platform-core/src/billing/crypto/evm/`. Fix imports:

`watcher.ts`:
- `"../cursor-store.js"` → `"../../stores/cursor-store.js"`
- `"./config.js"` → stays (same dir)
- `"./types.js"` → stays (same dir)

`eth-watcher.ts`:
- `"../cursor-store.js"` → `"../../stores/cursor-store.js"`
- `"../oracle/types.js"` → `"../../oracle/types.js"`
- `"../plugin/interfaces.js"` → `"../../plugin/interfaces.js"`
- `"./types.js"` → stays (same dir)
- `"./watcher.js"` → stays (same dir)

`types.ts` and `config.ts` — copy verbatim.

Do NOT copy `settler.ts`, `eth-settler.ts`, `checkout.ts`, `eth-checkout.ts` — they stay in platform-core.

- [ ] **Step 3: Verify build**

```bash
pnpm build
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add BTC and EVM chain watchers"
```

---

## Task 7: Watcher services

**Files:**
- Create: `src/watchers/watcher-service.ts`, `src/watchers/plugin-watcher-service.ts`

- [ ] **Step 1: Copy watcher-service.ts**

Copy from `~/platform-core/src/billing/crypto/watcher-service.ts`. Fix imports:
- `"../../db/index.js"` → `"../db/index.js"` (use `CryptoDb` instead of `DrizzleDb`)
- `"../../db/schema/crypto.js"` → `"../db/schema.js"`
- `"./btc/types.js"` → `"../chains/btc/types.js"`
- `"./btc/watcher.js"` → `"../chains/btc/watcher.js"`
- `"./charge-store.js"` → `"../stores/charge-store.js"`
- `"./cursor-store.js"` → `"../stores/cursor-store.js"`
- `"./evm/eth-watcher.js"` → `"../chains/evm/eth-watcher.js"`
- `"./evm/types.js"` → `"../chains/evm/types.js"`
- `"./evm/watcher.js"` → `"../chains/evm/watcher.js"`
- `"./oracle/types.js"` → `"../oracle/types.js"`
- `"./payment-method-store.js"` → `"../stores/payment-method-store.js"`
- `"./tron/address-convert.js"` → `"../chains/tron/address-convert.js"`
- `"./types.js"` → `"../types.js"`

Replace `DrizzleDb` with `CryptoDb` in all type annotations.

- [ ] **Step 2: Copy plugin-watcher-service.ts**

Copy from `~/platform-core/src/billing/crypto/plugin-watcher-service.ts`. Fix imports:
- `"../../db/index.js"` → `"../db/index.js"` (use `CryptoDb` instead of `DrizzleDb`)
- `"./charge-store.js"` → `"../stores/charge-store.js"`
- `"./cursor-store.js"` → `"../stores/cursor-store.js"`
- `"./oracle/types.js"` → `"../oracle/types.js"`
- `"./payment-method-store.js"` → `"../stores/payment-method-store.js"`
- `"./plugin/interfaces.js"` → `"../plugin/interfaces.js"`
- `"./plugin/registry.js"` → `"../plugin/registry.js"`
- `"./watcher-service.js"` → `"./watcher-service.js"` (same dir, no change)

Replace `DrizzleDb` with `CryptoDb` in all type annotations.

- [ ] **Step 3: Verify build**

```bash
pnpm build
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add watcher services (legacy + plugin-based)"
```

---

## Task 8: Hono server + entry point

**Files:**
- Create: `src/server.ts`, `src/entry.ts`

- [ ] **Step 1: Copy server.ts (Hono routes)**

Copy from `~/platform-core/src/billing/crypto/key-server.ts`. Fix imports:
- `"../../db/index.js"` → `"./db/index.js"` (use `CryptoDb`)
- `"../../db/schema/crypto.js"` → `"./db/schema.js"`
- `"./address-gen.js"` stays `"./address-gen.js"`
- `"./charge-store.js"` → `"./stores/charge-store.js"`
- `"./oracle/convert.js"` stays
- `"./oracle/types.js"` stays
- `"./payment-method-store.js"` → `"./stores/payment-method-store.js"`
- `"./plugin/registry.js"` stays

Replace `DrizzleDb` with `CryptoDb` in all type annotations.

- [ ] **Step 2: Copy entry.ts (standalone boot)**

Copy from `~/platform-core/src/billing/crypto/key-server-entry.ts`. Fix every import:
- REMOVE: `import * as schema from "../../db/schema/index.js"`
- ADD: `import { createDb } from "./db/index.js"`
- `"./charge-store.js"` → `"./stores/charge-store.js"`
- `"./cursor-store.js"` → `"./stores/cursor-store.js"`
- `"./evm/watcher.js"` → `"./chains/evm/watcher.js"` (for `createRpcCaller`)
- `"./key-server.js"` → `"./server.js"` (for `createKeyServerApp`)
- `"./oracle/chainlink.js"` → stays (already at src root)
- `"./oracle/coingecko.js"` → stays
- `"./oracle/composite.js"` → stays
- `"./oracle/fixed.js"` → stays
- `"./payment-method-store.js"` → `"./stores/payment-method-store.js"`
- `"./plugin/registry.js"` → stays
- `"./plugin-watcher-service.js"` → `"./watchers/plugin-watcher-service.js"`
- `"./watcher-service.js"` → `"./watchers/watcher-service.js"`
- `@wopr-network/crypto-plugins` → stays (external dep)
- `drizzle-orm/node-postgres` → stays (external dep)
- `pg` → stays (external dep)

Replace `drizzle(pool, { schema }) as unknown as DrizzleDb` with `createDb(pool)`.
Remove the `import("../../db/index.js").DrizzleDb` type cast.

- [ ] **Step 3: Verify build**

```bash
pnpm build
```

- [ ] **Step 4: Smoke test locally (if DB available)**

```bash
DATABASE_URL=postgres://... node dist/entry.js
# Should print: [crypto-key-server] Listening on :3100
# Ctrl+C to stop
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Hono server routes and standalone entry point"
```

---

## Task 9: Tests

**Files:**
- Create: `src/__tests__/` with all server-side tests

- [ ] **Step 1: Copy test files**

Copy from `~/platform-core/src/billing/crypto/__tests__/`:
- `key-server.test.ts`
- `watcher-service.test.ts`
- `address-gen.test.ts`
- `webhook-confirmations.test.ts`

Copy from subdirectories:
- `plugin/__tests__/*`
- `btc/__tests__/*` (watcher tests only, NOT settler/checkout tests)
- `evm/__tests__/*` (watcher tests only)
- `tron/__tests__/*`
- `oracle/__tests__/*`

Fix all import paths to match new structure.

- [ ] **Step 2: Run tests**

```bash
pnpm test
```

Fix any import errors or path issues.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test: add server-side test suite"
```

---

## Task 10: Dockerfile + CI

**Files:**
- Create: `Dockerfile`, `.github/workflows/ci.yml`

- [ ] **Step 1: Write Dockerfile**

```dockerfile
FROM node:24-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:24-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle
EXPOSE 3100
CMD ["node", "dist/entry.js"]
```

- [ ] **Step 2: Write CI workflow**

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: self-hosted
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm format --check
      - run: pnpm build
      - run: pnpm test

  docker:
    runs-on: self-hosted
    needs: ci
    if: github.ref == 'refs/heads/main'
    permissions:
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          push: true
          tags: ghcr.io/wopr-network/platform-crypto-server:latest
```

- [ ] **Step 3: Build Docker image locally**

```bash
docker build -t platform-crypto-server:test .
```

- [ ] **Step 4: Commit and push**

```bash
git add -A
git commit -m "ci: add Dockerfile and GitHub Actions workflow"
git push -u origin main
```

- [ ] **Step 5: Verify CI passes**

```bash
gh run watch
```

---

## Task 11: Deploy to chain box

- [ ] **Step 1: SSH to chain box and update compose**

```bash
ssh root@167.71.118.221
```

Update the docker-compose.yml to use the new image `ghcr.io/wopr-network/platform-crypto-server:latest` instead of the platform-core-based image for the key server service.

- [ ] **Step 2: Pull and recreate**

```bash
docker compose pull
docker compose up -d
```

- [ ] **Step 3: Smoke test the Hono API**

```bash
# Health check
curl http://localhost:3100/chains

# Create a test charge (if service key configured)
curl -X POST http://localhost:3100/charges \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"chain": "btc", "amountUsd": 10}'
```

- [ ] **Step 4: Verify watchers are running**

Check container logs for watcher startup messages:
```bash
docker compose logs --tail=50 crypto-server
```

Expected: `[watcher] Started X watchers` + `[crypto-key-server] Listening on :3100`

- [ ] **Step 5: Rollback plan (reference only — execute if Step 3/4 fails)**

If the new image fails:
1. Revert docker-compose.yml to use the old platform-core image
2. `docker compose pull && docker compose up -d`
3. The DB is unchanged (baseline migration was all `IF NOT EXISTS`)
4. Do NOT proceed to Task 12 until the new image is verified

---

## Task 12: Audit platform-core consumers before deletion

Before deleting server files, verify nothing outside `billing/crypto/` imports them.

- [ ] **Step 1: Search for server-symbol imports across platform-core**

```bash
cd ~/platform-core
# Check for imports of server modules we're about to delete
grep -rn "charge-store\|cursor-store\|payment-method-store\|key-server\|address-gen\|watcher-service\|plugin-watcher\|PluginRegistry\|createKeyServerApp" src/ \
  --include="*.ts" \
  | grep -v "billing/crypto/" \
  | grep -v "__tests__/" \
  | grep -v "node_modules/"
```

If any hits: those consumers need updating before deletion. Fix them first.

- [ ] **Step 2: Search for address-gen re-exports used outside crypto**

The `btc/index.ts` and `evm/index.ts` barrels currently re-export `deriveAddress`, `isValidXpub`, `deriveTreasury` from `address-gen.ts`. After extraction, these are dropped.

```bash
grep -rn "deriveAddress\|isValidXpub\|deriveTreasury\|EncodingParams" src/ \
  --include="*.ts" \
  | grep -v "billing/crypto/" \
  | grep -v "__tests__/"
```

If any hits: those consumers must switch to importing from `@wopr-network/platform-crypto-server` or the functions need to stay in platform-core (copy, not move).

- [ ] **Step 3: Search for oracle/plugin exports used outside crypto**

```bash
grep -rn "ChainlinkOracle\|CoinGeckoOracle\|CompositeOracle\|FixedPriceOracle\|IChainPlugin\|IAddressEncoder\|ICurveDeriver" src/ \
  --include="*.ts" \
  | grep -v "billing/crypto/" \
  | grep -v "__tests__/"
```

- [ ] **Step 4: Document findings and proceed**

If all clean: proceed to Task 13. If consumers found: create fix steps before deletion.

---

## Task 13: Delete server files from platform-core

**Files:**
- Delete: all server-side files that moved (see File Map)

- [ ] **Step 1: Delete server files**

Delete from `src/billing/crypto/`:
- `key-server-entry.ts`
- `key-server.ts`
- `charge-store.ts`
- `cursor-store.ts`
- `payment-method-store.ts`
- `address-gen.ts`
- `watcher-service.ts`
- `plugin-watcher-service.ts`
- `oracle/` (entire directory)
- `plugin/` (entire directory)
- `tron/` (entire directory)

Delete server-only tests from `__tests__/`:
- `key-server.test.ts`
- `watcher-service.test.ts`
- `address-gen.test.ts`
- `webhook-confirmations.test.ts`

Delete server-only chain files:
- `btc/watcher.ts`
- `evm/watcher.ts`
- `evm/eth-watcher.ts`

- [ ] **Step 2: Commit deletion**

```bash
git add -A
git commit -m "refactor: delete crypto server files (moved to platform-crypto-server)"
```

---

## Task 14: Update platform-core barrel files + package.json

**Files:**
- Modify: `src/billing/crypto/index.ts`, `src/billing/crypto/btc/index.ts`, `src/billing/crypto/evm/index.ts`, `package.json`, `src/billing/crypto/types.ts`

- [ ] **Step 1: Update `src/billing/crypto/btc/index.ts`**

Remove watcher + address-gen exports. Keep settlers + checkouts + config + types:

```ts
export type { BtcCheckoutDeps, BtcCheckoutResult } from "./checkout.js";
export { createBtcCheckout, MIN_BTC_USD } from "./checkout.js";
export { centsToSats, loadBitcoindConfig, satsToCents } from "./config.js";
export type { BtcSettlerDeps } from "./settler.js";
export { settleBtcPayment } from "./settler.js";
export type { BitcoindConfig, BtcCheckoutOpts, BtcPaymentEvent } from "./types.js";
```

Note: `deriveAddress`, `isValidXpub`, `deriveTreasury`, `EncodingParams` re-exports are dropped. Consumers outside crypto (if any found in Task 12) must import from `@wopr-network/platform-crypto-server` instead.

- [ ] **Step 2: Update `src/billing/crypto/evm/index.ts`**

Remove watcher + address-gen exports. Keep settlers + checkouts + config + types:

```ts
export type { StablecoinCheckoutDeps, StablecoinCheckoutResult } from "./checkout.js";
export { createStablecoinCheckout, MIN_STABLECOIN_USD } from "./checkout.js";
export { centsFromTokenAmount, getChainConfig, getTokenConfig, tokenAmountFromCents } from "./config.js";
export type { EthCheckoutDeps, EthCheckoutOpts, EthCheckoutResult } from "./eth-checkout.js";
export { createEthCheckout, MIN_ETH_USD } from "./eth-checkout.js";
export type { EthSettlerDeps } from "./eth-settler.js";
export { settleEthPayment } from "./eth-settler.js";
export type { EvmSettlerDeps } from "./settler.js";
export { settleEvmPayment } from "./settler.js";
export type { ChainConfig, EvmChain, StablecoinCheckoutOpts, StablecoinToken, TokenConfig } from "./types.js";
```

- [ ] **Step 3: Update `src/billing/crypto/index.ts`**

Remove all server exports. Keep only client + ledger glue:

```ts
// Client
export type { ChainInfo, ChargeStatus, CreateChargeResult, CryptoConfig, CryptoServiceConfig, DeriveAddressResult } from "./client.js";
export { CryptoServiceClient, loadCryptoConfig } from "./client.js";

// Ledger glue (webhook handler)
export type { KeyServerWebhookDeps as CryptoWebhookDeps, KeyServerWebhookPayload as CryptoWebhookPayload, KeyServerWebhookResult as CryptoWebhookResult } from "./key-server-webhook.js";
export { handleKeyServerWebhook, handleKeyServerWebhook as handleCryptoWebhook, normalizeStatus } from "./key-server-webhook.js";

// Checkout orchestration
export type { UnifiedCheckoutDeps, UnifiedCheckoutResult } from "./unified-checkout.js";
export { createUnifiedCheckout, MIN_CHECKOUT_USD as MIN_PAYMENT_USD, MIN_CHECKOUT_USD } from "./unified-checkout.js";

// Types
export type { CryptoCharge, CryptoChargeStatus, CryptoPaymentState } from "./types.js";

// Chain-specific settlers + checkouts
export * from "./btc/index.js";
export * from "./evm/index.js";
```

- [ ] **Step 4: Remove `./crypto-plugin` from package.json exports**

In `~/platform-core/package.json`, delete:
```json
"./crypto-plugin": {
  "import": "./dist/billing/crypto/plugin/index.js",
  "types": "./dist/billing/crypto/plugin/index.d.ts"
}
```

- [ ] **Step 5: Clean up dead BTCPay types in `types.ts`**

Remove from `src/billing/crypto/types.ts`:
- `CryptoWebhookPayload` (BTCPay-era)
- `CryptoBillingConfig` (BTCPay-era)
- `CryptoWebhookResult` (BTCPay-era)
- `mapBtcPayEventToStatus()` (BTCPay-era)

- [ ] **Step 6: Build + lint + format + test**

```bash
cd ~/platform-core
pnpm lint && pnpm format && pnpm build && pnpm test
```

Fix any broken imports in remaining code that referenced deleted files.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: update barrel files, remove crypto-plugin export

BREAKING: ./crypto-plugin export removed — use @wopr-network/platform-crypto-server/plugin
BREAKING: deriveAddress/isValidXpub no longer re-exported from btc/evm barrels"
```

---

## Task 15: Update crypto-plugins

**Files:**
- Modify: `~/crypto-plugins/package.json`, all import statements

- [ ] **Step 1: Update dependency**

In `~/crypto-plugins/package.json`:
- Remove `"@wopr-network/platform-core"` from `peerDependencies` and `devDependencies`
- Add `"@wopr-network/platform-crypto-server"` to both

- [ ] **Step 2: Update all imports**

Find-and-replace across all `src/**/*.ts`:
- `"@wopr-network/platform-core/crypto-plugin"` → `"@wopr-network/platform-crypto-server/plugin"`

- [ ] **Step 3: Build + test**

```bash
cd ~/crypto-plugins
pnpm install
pnpm lint && pnpm build && pnpm test
```

- [ ] **Step 4: Commit and publish**

```bash
git add -A
git commit -m "refactor: import plugin types from platform-crypto-server"
git push
```

---

## Task 16: Publish platform-core + verify products

- [ ] **Step 1: Publish platform-core**

Push the cleanup commit, let CI publish the new minor version.

- [ ] **Step 2: Verify no product breakage**

Check that paperclip-platform, wopr-platform, holyship, nemoclaw-platform all still build with the new platform-core version. Their imports (`CryptoServiceClient`, settlers, webhook handler) should all still resolve from the updated `billing/crypto/index.ts`.

- [ ] **Step 3: Bump platform-core in all products**

```bash
pnpm update @wopr-network/platform-core
```

- [ ] **Step 4: Verify chain box is still working**

```bash
curl https://pay.wopr.bot/chains
```

Should return the list of enabled chains — now served by the new lightweight image.

- [ ] **Step 5: Rollback if products break**

If a product fails to build with the new platform-core:
1. Pin the product to the previous platform-core version in `package.json`
2. Investigate which deleted export the product was using
3. Either re-export from platform-core or update the product to use `@wopr-network/platform-crypto-server` directly

Should return the list of enabled chains — now served by the new lightweight image.
