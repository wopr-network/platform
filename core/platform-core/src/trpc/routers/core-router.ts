/**
 * Core router factory — composes all shared tRPC routers into a single
 * router that each platform can include in its appRouter.
 *
 * Each product calls createCoreRouter(deps) at boot time.
 */

import { router } from "../init.js";
import { type AdminCoreRouterDeps, createAdminCoreRouter } from "./admin.js";
import { type BillingRouterDeps, createBillingRouter } from "./billing.js";
import { createFleetCoreRouter, type FleetCoreRouterDeps } from "./fleet-core.js";
import { createOrgRouter, type OrgRouterDeps } from "./org.js";
import { createPageContextRouter, type PageContextRouterDeps } from "./page-context.js";
import { createProfileRouter, type ProfileRouterDeps } from "./profile.js";
import { createSettingsRouter, type SettingsRouterDeps } from "./settings.js";

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
  });
}
