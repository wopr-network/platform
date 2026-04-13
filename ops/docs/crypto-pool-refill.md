# Crypto Pool Refill Runbook

Pre-derived address pools (Solana, TON) on the chain server (pay.wopr.bot). Everything you need to check depth, extend the pool, and understand what can go wrong.

## TL;DR

```bash
# 1. Check current depth
ssh root@167.71.118.221 'curl -s -H "Authorization: Bearer ks-admin-2026" \
  http://localhost:3100/admin/pool/status'

# 2. Fetch 3 known addresses (for derivation-path verification)
ssh root@167.71.118.221 "docker exec chain-postgres psql -U platform -d crypto_key_server \
  -c \"SELECT derivation_index, address FROM address_pool \
       WHERE key_ring_id='sol-main' ORDER BY derivation_index LIMIT 3;\""

# 3. Decrypt mnemonic (from G:\My Drive\paperclip-wallet.enc)
openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
  -in paperclip-wallet.enc -out /tmp/mnemonic.txt

# 4. Refill (auto-detects path, auto-picks start index)
MNEMONIC="$(cat /tmp/mnemonic.txt)" node scripts/generate-sol-pool.mjs \
  --verify=0:<addr0>,1:<addr1>,2:<addr2> \
  --count=1000

# 5. Shred the decrypted mnemonic
shred -u /tmp/mnemonic.txt
```

## Key Facts

- **Server**: `http://pay.wopr.bot:3100` (also `http://167.71.118.221:3100`)
- **Admin token**: `ks-admin-2026` (stored in `TOPOLOGY.md:451-460`)
- **Database**: `chain-postgres` container on chain-server, user `platform`, db `crypto_key_server`, password `crypto-ks-2026`
- **Source code**: `~/platform-crypto-server` (`src/server.ts:554` replenish, `src/server.ts:632` status)
- **Mnemonic vault**: `G:\My Drive\paperclip-wallet.enc` (openssl aes-256-cbc, pbkdf2, 100k iter)

## Pools

| Key ring | Coin type | Curve | Scheme | Encoding | Plugin |
|----------|-----------|-------|--------|----------|--------|
| `sol-main` | 501 | ed25519 | slip0010 | base58-solana | solana |
| `ton-main` | 607 | ed25519 | slip0010 (V4R2) | ton-base64url | ton |

Both share the same mnemonic (same BIP39 seed, different coin_type branches).

## Derivation Paths (verified)

| Pool | Path | Convention | Verified |
|------|------|------------|----------|
| `sol-main` | `m/44'/501'/{i}'/0'` | Phantom/Sollet (4 hardened levels) | 2026-04-13 against indices 0, 1, 2 |
| `ton-main` | `m/44'/607'/{i}'` | Tonkeeper V4R2 (3 hardened levels) | via `generate-ton-pool.mjs:84-92` |

Solana has **no canonical derivation path** — Phantom, Sollet, the Solana CLI, and ad-hoc scripts all use different conventions. The chain server's `/admin/pool/replenish` endpoint only validates `pubkey → address` encoding; it does **not** verify the derivation path. A mismatched path produces addresses that *look valid* to the server but whose private keys are unrecoverable at sweep time → funds locked forever.

`generate-sol-pool.mjs` mitigates this by trying several candidate paths and comparing to existing pool addresses. The verified path above is tried first; if you're running against a future pool that used a different scheme, the script will report which candidate matched (or abort if none match — in which case the vault mnemonic and the pool were generated from different seeds and you must NOT refill).

Candidate paths tried (in order, see `generate-sol-pool.mjs` `CANDIDATES`):
- `m/44'/501'/{i}'/0'`  ← current `sol-main`
- `m/44'/501'/{i}'`
- `m/44'/501'/0'/{i}'`
- `m/44'/501'/0'/0'/{i}'`
- `m/501'/{i}'`

## Sweep Status (IMPORTANT)

Solana sweep is **not yet implemented**. `@wopr-network/crypto-plugins` has a `SolanaSweeper` class that can scan balances and sign transfers, but `crypto-sweep`'s entry point (`src/sweep/index.ts:328-367`) explicitly skips Solana because it can't re-derive ed25519 keys from the secp256k1-oriented HDKey flow.

**Implication**: funds deposited to assigned Solana pool addresses are currently trapped unless the mnemonic holder re-derives manually. Before the pool is heavily used, implement:

1. `GET /admin/pool/export` endpoint on the chain server (returns `{index, public_key, address}` for assigned addresses, admin-auth-gated)
2. Solana branch in `crypto-sweep` that derives private keys via SLIP-0010 using the detected path

Until then, keep payment volume small and track which indices have been assigned so manual sweep is tractable.

## Endpoint Reference

### `POST /admin/pool/replenish`
**Auth**: `Authorization: Bearer <ADMIN_TOKEN>`
**Body**:
```json
{
  "key_ring_id": "sol-main",
  "plugin_id": "solana",
  "encoding": "base58-solana",
  "addresses": [
    { "index": 1000, "public_key": "<hex>", "address": "<base58>" }
  ]
}
```
**Validation**: Server re-encodes each `public_key` via the plugin's encoder and rejects the whole batch if any address mismatches. Duplicate `(key_ring_id, index)` pairs are silently skipped (ON CONFLICT DO NOTHING).
**Response**: `{ inserted: N, total: N }` — note `inserted` is the count newly written, `total` is the full pool size after.

### `GET /admin/pool/status`
**Auth**: `Authorization: Bearer <ADMIN_TOKEN>`
**Response**: `{ pools: [{ key_ring_id, total, available, assigned }] }`

### `GET /admin/chains`
**Auth**: `Authorization: Bearer <ADMIN_TOKEN>`
**Response**: array of chain configs (coin_type, curve, encoding, rpc_url, etc.). Use to confirm `coin_type` and `encoding` values before refilling.

## Troubleshooting

**"No candidate path matches"** — Mnemonic is wrong, or the original pool was generated with an ad-hoc path. Double-check the decrypted mnemonic by deriving a BTC address at `m/44'/0'/0'/0/0` and cross-referencing a known BTC deposit address.

**"Address mismatch at index N"** — The derivation path detected matched samples but a later index doesn't encode consistently. Usually a bug in the derivation or encoder — bail and investigate; do not override validation.

**Pool assigned count unexpectedly high** — Check whether a test harness or a product is claiming addresses without paying (see `payment_methods` + `charges` tables). Do not refill blindly; find the leak first.

**Upload hangs** — Chain server may be CPU-pegged by node sync. `ssh root@167.71.118.221 'top -bn1 | head'` to confirm. Retry when load drops.

## See Also

- `~/platform-crypto-server/src/server.ts:554` — `POST /admin/pool/replenish` implementation
- `~/platform/ops/scripts/generate-ton-pool.mjs` — TON equivalent (no path detection needed)
- `~/platform/ops/scripts/generate-sol-pool.mjs` — Solana refill with path auto-detect
- `~/crypto-plugins/src/solana/sweeper.ts` — scan/sweep code (not yet wired end-to-end)
- `~/platform/ops/TOPOLOGY.md:451-460` — chain server credentials
- `~/platform/ops/TOPOLOGY.md:587` — mnemonic vault location
