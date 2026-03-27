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
