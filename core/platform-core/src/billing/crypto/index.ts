// Client

// Chain-specific settlers + checkouts
export * from "./btc/index.js";
// Stores (products use these for local charge tracking)
export type {
  CryptoChargeProgressUpdate,
  CryptoChargeRecord,
  CryptoDepositChargeInput,
  ICryptoChargeRepository,
} from "./charge-store.js";
export { CryptoChargeRepository, DrizzleCryptoChargeRepository } from "./charge-store.js";
export type {
  ChainInfo,
  ChargeStatus,
  CreateChargeResult,
  CryptoConfig,
  CryptoServiceConfig,
  DeriveAddressResult,
} from "./client.js";
export { CryptoServiceClient, loadCryptoConfig } from "./client.js";
export type { IWatcherCursorStore } from "./cursor-store.js";
export { DrizzleWatcherCursorStore } from "./cursor-store.js";
export * from "./evm/index.js";

// Ledger glue (webhook handler)
export type {
  KeyServerWebhookDeps as CryptoWebhookDeps,
  KeyServerWebhookPayload as CryptoWebhookPayload,
  KeyServerWebhookResult as CryptoWebhookResult,
} from "./key-server-webhook.js";
export {
  handleKeyServerWebhook,
  handleKeyServerWebhook as handleCryptoWebhook,
  normalizeStatus,
} from "./key-server-webhook.js";
export type { IPaymentMethodStore, PaymentMethodRecord } from "./payment-method-store.js";
export { DrizzlePaymentMethodStore } from "./payment-method-store.js";

// Types
export type {
  CryptoCharge,
  CryptoChargeStatus,
  CryptoPaymentState,
  CryptoWebhookResult as SettlerWebhookResult,
} from "./types.js";
// Checkout orchestration
export type { UnifiedCheckoutDeps, UnifiedCheckoutResult } from "./unified-checkout.js";
export { createUnifiedCheckout, MIN_CHECKOUT_USD as MIN_PAYMENT_USD, MIN_CHECKOUT_USD } from "./unified-checkout.js";
