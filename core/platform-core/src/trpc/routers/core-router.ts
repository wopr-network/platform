/**
 * Core router factory — composes all shared tRPC routers into a single
 * router that each platform can include in its appRouter.
 *
 * Each product calls createCoreRouter(deps) at boot time.
 */

import { authSocialRouter } from "../auth-social-router.js";
import { router } from "../init.js";
import { type AccountRouterDeps, createAccountRouter } from "./account.js";
import { type AddonRouterDeps, createAddonRouter } from "./addons.js";
import { type AdminCoreRouterDeps, createAdminCoreRouter } from "./admin.js";
import { type BillingRouterDeps, createBillingRouter } from "./billing.js";
import { createFleetCoreRouter, type FleetCoreRouterDeps } from "./fleet-core.js";
import { createInferenceAdminRouter, type InferenceAdminRouterDeps } from "./inference-admin.js";
import { createMarketplaceRouter, type MarketplaceRouterDeps } from "./marketplace.js";

import { createNodesRouter, type NodesRouterDeps } from "./nodes.js";
import { createOrgRouter, type OrgRouterDeps } from "./org.js";
import { createOrgKeysRouter, type OrgKeysRouterDeps } from "./org-keys.js";
import { createPageContextRouter, type PageContextRouterDeps } from "./page-context.js";
import { createProfileRouter, type ProfileRouterDeps } from "./profile.js";
import { createPromotionsRouter, type PromotionsRouterDeps } from "./promotions.js";
import { createSettingsRouter, type SettingsRouterDeps } from "./settings.js";
import { createTwoFactorRouter, type TwoFactorRouterDeps } from "./two-factor.js";

// ---------------------------------------------------------------------------
// Aggregate deps
// ---------------------------------------------------------------------------

export interface CoreRouterDeps {
  billing: BillingRouterDeps;
  settings: SettingsRouterDeps;
  profile: ProfileRouterDeps;
  pageContext: PageContextRouterDeps;
  org: OrgRouterDeps;
  fleet?: FleetCoreRouterDeps;
  admin?: AdminCoreRouterDeps;
  account?: AccountRouterDeps;
  promotions?: PromotionsRouterDeps;
  twoFactor?: TwoFactorRouterDeps;
  orgKeys?: OrgKeysRouterDeps;
  marketplace?: MarketplaceRouterDeps;

  inferenceAdmin?: InferenceAdminRouterDeps;
  addons?: AddonRouterDeps;
  nodes?: NodesRouterDeps;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Build the shared core router. Products compose this with their own
 * product-specific routers:
 *
 * ```ts
 * const appRouter = router({
 *   ...createCoreRouter(coreDeps).procedures,  // or merge
 *   admin: adminRouter,
 *   // product-specific routers...
 * });
 * ```
 *
 * Or use it directly:
 * ```ts
 * const coreRouter = createCoreRouter(coreDeps);
 * ```
 */
export function createCoreRouter(deps: CoreRouterDeps) {
  return router({
    billing: createBillingRouter(deps.billing),
    settings: createSettingsRouter(deps.settings),
    profile: createProfileRouter(deps.profile),
    pageContext: createPageContextRouter(deps.pageContext),
    org: createOrgRouter(deps.org),
    ...(deps.fleet ? { fleet: createFleetCoreRouter(deps.fleet) } : {}),
    ...(deps.admin ? { admin: createAdminCoreRouter(deps.admin) } : {}),
    ...(deps.account ? { account: createAccountRouter(deps.account) } : {}),
    ...(deps.promotions ? { promotions: createPromotionsRouter(deps.promotions) } : {}),
    ...(deps.twoFactor ? { twoFactor: createTwoFactorRouter(deps.twoFactor) } : {}),
    ...(deps.orgKeys ? { orgKeys: createOrgKeysRouter(deps.orgKeys) } : {}),
    ...(deps.marketplace ? { marketplace: createMarketplaceRouter(deps.marketplace) } : {}),

    ...(deps.inferenceAdmin ? { inferenceAdmin: createInferenceAdminRouter(deps.inferenceAdmin) } : {}),
    ...(deps.addons ? { addons: createAddonRouter(deps.addons) } : {}),
    ...(deps.nodes ? { nodes: createNodesRouter(deps.nodes) } : {}),
    authSocial: authSocialRouter,
  });
}
