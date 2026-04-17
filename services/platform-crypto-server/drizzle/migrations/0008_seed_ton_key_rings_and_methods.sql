-- Seed the ton-main and ton-testnet-main key_rings and all three TON
-- payment_methods rows so a fresh database is fully functional out of the box.
--
-- Why this exists: migrations 0002 and 0003 only UPDATE — they silently
-- no-op on a database where these rows don't yet exist. Before this
-- migration, a clean install required manual API calls to seed the key rings
-- and payment methods before TON charge creation could work at all.
--
-- Idempotent — ON CONFLICT DO NOTHING means prod is completely unaffected;
-- key_material stays as-is on existing rows (the {} default is correct for
-- pre-derived mode; real addresses live in address_pool, not in key_material).

-- 1. Key rings (pre-derived Ed25519 — addresses live in address_pool, not key_material)
INSERT INTO key_rings (id, curve, derivation_scheme, derivation_mode, coin_type, account_index, key_material)
VALUES
  ('ton-main',         'ed25519', 'slip10', 'pre-derived', 607, 0, '{}'),
  ('ton-testnet-main', 'ed25519', 'slip10', 'pre-derived', 607, 1, '{}')
ON CONFLICT (id) DO NOTHING;

-- 2. TON native and Jetton payment methods
INSERT INTO payment_methods (
  id, type, token, chain, contract_address, decimals, display_name,
  enabled, display_order, icon_url, rpc_url, rpc_headers,
  address_type, watcher_type, oracle_asset_id, confirmations,
  next_index, key_ring_id, encoding, plugin_id, is_testnet, encoding_params
) VALUES
  (
    'TON:ton', 'native', 'TON', 'ton', NULL, 9, 'Toncoin',
    true, 50,
    'https://assets.coingecko.com/coins/images/17980/standard/ton_symbol.png',
    'https://toncenter.com/api/v2', '{}',
    'ton-base64url', 'ton', 'the-open-network', 1,
    0, 'ton-main', NULL, 'ton', false, '{}'
  ),
  (
    'USDT:ton', 'jetton', 'USDT', 'ton',
    'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs',
    6, 'Tether USD (TON)',
    true, 51,
    'https://assets.coingecko.com/coins/images/325/standard/Tether.png',
    'https://toncenter.com/api/v2', '{}',
    'ton-base64url', 'ton', 'tether', 1,
    0, 'ton-main', NULL, 'ton', false, '{}'
  ),
  (
    'TON:ton-testnet', 'native', 'TON', 'ton-testnet', NULL, 9, 'Toncoin Testnet',
    true, 0, NULL,
    'https://testnet.toncenter.com/api/v2', '{}',
    'ton-base64url', 'ton', 'the-open-network', 1,
    0, 'ton-testnet-main', 'ton-base64url', 'ton', true, '{}'
  )
ON CONFLICT (id) DO NOTHING;
