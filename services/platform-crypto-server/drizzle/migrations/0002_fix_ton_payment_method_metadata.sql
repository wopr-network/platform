-- Link TON payment_methods to the ton-main key_ring and ensure the key_ring
-- itself has the right curve/coin_type/derivation_mode.
--
-- Why this matters: admin/chains and the deriveNextAddress pool-routing
-- check read from key_rings (not from payment_methods). When key_ring_id is
-- NULL on a payment_method row, pool mode is never triggered — the server
-- falls through to the secp256k1 xpub derivation path, which has no xpub
-- for TON. Net effect: TON charge creation silently fails before this fix.
--
-- The ton-main key_ring already exists (1000 pool addresses FK'd to it via
-- address_pool.key_ring_id). We update it to the canonical Ed25519 config
-- and link the two TON payment_methods rows (TON:ton and USDT:ton) to it.

-- 1. Canonicalize the ton-main key_ring metadata. Pool entries already
-- reference it, so we just normalize its attributes.
UPDATE key_rings
   SET curve = 'ed25519',
       coin_type = 607,
       derivation_scheme = 'slip10',
       derivation_mode = 'pre-derived'
 WHERE id = 'ton-main';

-- 2. Link all TON payment_methods to ton-main. Only fills nulls — never
-- overrides an intentionally-set keyRingId.
UPDATE payment_methods
   SET key_ring_id = 'ton-main'
 WHERE chain = 'ton'
   AND key_ring_id IS NULL;
