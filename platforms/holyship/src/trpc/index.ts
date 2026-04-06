/**
 * Root tRPC app router — composes all domain sub-routers.
 *
 * Billing, org, profile, and settings are proxied to core via core-client.
 * Engine-specific routers (flows, entities, etc.) are holyship's own.
 */

import { router } from "./init.js";
import { billingProxyRouter } from "./routers/billing-proxy.js";
import { orgRouter } from "./routers/org.js";
import { profileRouter } from "./routers/profile.js";
import { settingsRouter } from "./routers/settings.js";

export const appRouter = router({
  billing: billingProxyRouter,
  org: orgRouter,
  profile: profileRouter,
  settings: settingsRouter,
});

/** The root router type — import this in the UI repo for full type inference. */
export type AppRouter = typeof appRouter;

export { createTRPCContext } from "./init.js";
