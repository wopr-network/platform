export { createAdminFleetUpdateRouter } from "./admin-fleet-update-router.js";
export { createAssertOrgAdminOrOwner } from "./auth-helpers.js";
export { authSocialRouter } from "./auth-social-router.js";
export {
  createAdminFleetUpdateRouterFromContainer,
  createFleetUpdateConfigRouterFromContainer,
  createNotificationTemplateRouterFromContainer,
  createOrgRemovePaymentMethodRouterFromContainer,
  createProductConfigRouterFromContainer,
  initTrpcFromContainer,
} from "./container-factories.js";
export { createFleetUpdateConfigRouter } from "./fleet-update-config-router.js";
export {
  adminProcedure,
  createCallerFactory,
  createTRPCContext,
  orgAdminProcedure,
  orgMemberProcedure,
  protectedProcedure,
  publicProcedure,
  router,
  setTrpcOrgMemberRepo,
  type TRPCContext,
  tenantProcedure,
} from "./init.js";
export { createNotificationTemplateRouter } from "./notification-template-router.js";
export {
  createOrgRemovePaymentMethodRouter,
  type OrgRemovePaymentMethodDeps,
} from "./org-remove-payment-method-router.js";
export { createProductConfigRouter } from "./product-config-router.js";

// ---------------------------------------------------------------------------
// Core routers — singleton (legacy) + DI-based factory (preferred)
// ---------------------------------------------------------------------------

// Internal service context factory (standalone mode)
export { createInternalTRPCContext } from "./internal-context.js";
// New core routers (DI-only — no singleton)
export { type BillingRouterDeps, createBillingRouter } from "./routers/billing.js";
export { type CoreRouterDeps, createCoreRouter } from "./routers/core-router.js";
export { createFleetCoreRouter, type FleetCoreRouterDeps } from "./routers/fleet-core.js";
export { createOrgRouter, type OrgRouterDeps } from "./routers/org.js";
export {
  createPageContextRouter,
  type PageContextRouterDeps,
  pageContextRouter,
  setPageContextRouterDeps,
} from "./routers/page-context.js";
export {
  createProfileRouter,
  type ProfileRouterDeps,
  profileRouter,
  setProfileRouterDeps,
} from "./routers/profile.js";
export {
  createSettingsRouter,
  type SettingsRouterDeps,
  setSettingsRouterDeps,
  settingsRouter,
} from "./routers/settings.js";
