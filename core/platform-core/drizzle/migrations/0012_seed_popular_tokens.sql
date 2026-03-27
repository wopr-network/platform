-- Verified Base mainnet contract addresses (source: basescan.org)
INSERT INTO "payment_methods" ("id", "type", "token", "chain", "contract_address", "decimals", "display_name", "display_order", "confirmations") VALUES
  ('WETH:base', 'erc20', 'WETH', 'base', '0x4200000000000000000000000000000000000006', 18, 'Wrapped ETH on Base', 4, 1),
  ('cbBTC:base', 'erc20', 'cbBTC', 'base', '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', 8, 'Coinbase BTC on Base', 5, 1),
  ('AERO:base', 'erc20', 'AERO', 'base', '0x940181a94A35A4569E4529A3CDfB74e38FD98631', 18, 'Aerodrome on Base', 6, 1),
  ('LINK:base', 'erc20', 'LINK', 'base', '0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196', 18, 'Chainlink on Base', 7, 1),
  ('UNI:base', 'erc20', 'UNI', 'base', '0xc3De830EA07524a0761646a6a4e4be0e114a3C83', 18, 'Uniswap on Base', 8, 1),
  ('LTC:litecoin', 'native', 'LTC', 'litecoin', NULL, 8, 'Litecoin', 9, 6),
  ('DOGE:dogecoin', 'native', 'DOGE', 'dogecoin', NULL, 8, 'Dogecoin', 10, 6)
ON CONFLICT ("id") DO NOTHING;
-- NOTE: PEPE, SHIB, RENDER not seeded — unverified Base contract addresses.
-- Add via admin panel after verifying contracts on basescan.org.
