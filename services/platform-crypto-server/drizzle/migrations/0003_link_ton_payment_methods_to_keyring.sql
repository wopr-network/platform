-- Re-issue of migration 0002's actual intent, as a fresh migration with a
-- new tag. 0002 got recorded as applied in __drizzle_migrations (despite
-- the original SQL targeting non-existent columns on payment_methods), so
-- editing 0002 in place didn't re-trigger it.
--
-- Idempotent — every UPDATE here only affects rows that don't already
-- have the correct values.
--
-- Why this matters: without key_ring_id set, deriveNextAddress() in
-- server.ts never enters pool mode for TON — it falls through to the
-- secp256k1 xpub path (which has no xpub for TON) and TON charge creation
-- silently fails. This links the TON payment_methods rows to the already-
-- populated ton-main key_ring so pool-mode claims fire.

-- 1. Normalize ton-main key_ring metadata (curve/coin_type/derivation_mode).
UPDATE key_rings
   SET curve = 'ed25519',
       coin_type = 607,
       derivation_scheme = 'slip10',
       derivation_mode = 'pre-derived'
 WHERE id = 'ton-main';

-- 2. Link all TON payment_methods to ton-main. Only fills nulls.
UPDATE payment_methods
   SET key_ring_id = 'ton-main'
 WHERE chain = 'ton'
   AND key_ring_id IS NULL;
