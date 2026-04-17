-- Fix corrupted DOGE addresses in derived_addresses and crypto_charges.
-- Root cause: pre-PR-#86 code path applied toLowerCase() to all address types
-- including Base58Check (p2pkh), which is case-sensitive.
-- All affected charges are status='New' with 0 amount_received_cents.
-- Indices 0-3 in derived_addresses were lowercased before the fix shipped.
-- Indices 2-4 in crypto_charges were lowercased before the fix shipped.

-- Correct-case addresses re-derived from xpub at m/0/{index}:
--   0: DU4bmo7naN3Gbo8ycXLUH4Eq3Fpj396mts
--   1: DFeP44ozwqrvDoFzBbTwq3DfRerTey8evf
--   2: DH9kSFDfv2nm1iTduxgmtjpvy6JwXGkpPS
--   3: D8bSyfnH5chGEiwhURrxH3fYjG3stcwAT9
--   4: DTYyB4dXHwRHXL8unbm8KqrdAZZTbiQBiZ (already correct in derived_addresses)

UPDATE derived_addresses
SET address = 'DU4bmo7naN3Gbo8ycXLUH4Eq3Fpj396mts'
WHERE chain_id = 'DOGE:dogecoin' AND derivation_index = 0;
--> statement-breakpoint

UPDATE derived_addresses
SET address = 'DFeP44ozwqrvDoFzBbTwq3DfRerTey8evf'
WHERE chain_id = 'DOGE:dogecoin' AND derivation_index = 1;
--> statement-breakpoint

UPDATE derived_addresses
SET address = 'DH9kSFDfv2nm1iTduxgmtjpvy6JwXGkpPS'
WHERE chain_id = 'DOGE:dogecoin' AND derivation_index = 2;
--> statement-breakpoint

UPDATE derived_addresses
SET address = 'D8bSyfnH5chGEiwhURrxH3fYjG3stcwAT9'
WHERE chain_id = 'DOGE:dogecoin' AND derivation_index = 3;
--> statement-breakpoint

UPDATE crypto_charges
SET deposit_address = 'DH9kSFDfv2nm1iTduxgmtjpvy6JwXGkpPS',
    reference_id    = 'doge:DH9kSFDfv2nm1iTduxgmtjpvy6JwXGkpPS'
WHERE reference_id = 'doge:dh9ksfdfv2nm1itduxgmtjpvy6jwxgkpps';
--> statement-breakpoint

UPDATE crypto_charges
SET deposit_address = 'D8bSyfnH5chGEiwhURrxH3fYjG3stcwAT9',
    reference_id    = 'doge:D8bSyfnH5chGEiwhURrxH3fYjG3stcwAT9'
WHERE reference_id = 'doge:d8bsyfnh5chgeiwhurrxh3fyjg3stcwat9';
--> statement-breakpoint

UPDATE crypto_charges
SET deposit_address = 'DTYyB4dXHwRHXL8unbm8KqrdAZZTbiQBiZ',
    reference_id    = 'doge:DTYyB4dXHwRHXL8unbm8KqrdAZZTbiQBiZ'
WHERE reference_id = 'doge:dtyyb4dxhwrhxl8unbm8kqrdazztbiqbiz';
