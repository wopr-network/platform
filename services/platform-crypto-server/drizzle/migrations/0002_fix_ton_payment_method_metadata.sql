-- Fix TON payment_methods rows that were seeded with wrong curve / coin_type.
--
-- The pool-based derivation path doesn't read these columns at runtime, so
-- this has been benign. But future code (e.g. the unified crypto-sweep CLI's
-- COIN_TYPE_FAMILIES dispatch) routes by coin_type, so getting these right
-- now prevents the next person from chasing a ghost.
--
-- TON uses Ed25519 (SLIP-0010) with coin_type 607 per the Tonkeeper standard.
--   m/44'/607'/{i}'  matches ops/scripts/generate-ton-pool.mjs.
UPDATE payment_methods
   SET curve = 'ed25519',
       coin_type = 607
 WHERE chain = 'ton'
   AND (curve <> 'ed25519' OR coin_type IS DISTINCT FROM 607);
