-- ton-testnet payment_methods rows were seeded with address_type='evm' (the
-- column default). TON addresses are base64url-encoded and case-sensitive —
-- normalizeAddress() must NOT lowercase them. This corrects the data so that
-- any address derived via the /address endpoint for ton-testnet is stored in
-- correct canonical form instead of being lowercased as if it were an EVM hex.
UPDATE payment_methods
   SET address_type = 'ton-base64url',
       watcher_type = 'ton'
 WHERE chain = 'ton-testnet'
   AND address_type = 'evm';
