// Thin wrapper — delegates to platform-core marketplace routes.
// WOPR-specific wiring (credentialVault, meterEmitter, fleet) is injected at mount time in app.ts.

export {
  createMarketplaceRoutes,
  type MarketplaceContentRepo,
  type MarketplaceDeps,
} from "@wopr-network/platform-core/api/routes/marketplace";
