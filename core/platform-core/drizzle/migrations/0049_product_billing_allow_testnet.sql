-- Per-product opt-in for advertising testnet-network payment methods on
-- the checkout. Default false — customer-facing products (runpaperclip,
-- holyship, etc.) only see mainnet unless explicitly flipped on for dev
-- or QA. Filtering happens in billing.supportedPaymentMethods against the
-- chain list returned by platform-crypto-server's /chains endpoint.
ALTER TABLE "product_billing_config" ADD COLUMN "allow_testnet" boolean NOT NULL DEFAULT false;
