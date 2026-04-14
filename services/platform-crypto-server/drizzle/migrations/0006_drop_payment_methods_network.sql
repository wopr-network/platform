-- `network` was overloaded since day one — the schema comment literally
-- said it held "mainnet", "base", or "arbitrum", which is a mix of logical
-- network and chain identity. It's been written to by POST /admin/chains
-- but never read back by any application code path (the PaymentMethodRecord
-- interface doesn't even expose it). With is_testnet now the authoritative
-- filter (migration 0005), network has no reason to exist.
ALTER TABLE "payment_methods" DROP COLUMN "network";
