/**
 * Root tRPC app router — composes all domain sub-routers.
 *
 * Only includes routers that the holyship-ui dashboard actually consumes.
 * Billing is proxied to the core server via core-client.
 */

import { createNotificationTemplateRouter, router } from "@wopr-network/platform-core/trpc";
import { getNotificationTemplateRepo } from "../services/notification-template-repo.js";
import { billingProxyRouter } from "./routers/billing-proxy.js";
import { orgRouter } from "./routers/org.js";
import { profileRouter } from "./routers/profile.js";
import { settingsRouter } from "./routers/settings.js";

export const appRouter = router({
  billing: billingProxyRouter,
  notificationTemplates: createNotificationTemplateRouter(() => getNotificationTemplateRepo()),
  org: orgRouter,
  profile: profileRouter,
  settings: settingsRouter,
});

/** The root router type — import this in the UI repo for full type inference. */
export type AppRouter = typeof appRouter;

// Re-export context type for adapter usage
export type { TRPCContext } from "@wopr-network/platform-core/trpc";
export { setTrpcOrgMemberRepo } from "@wopr-network/platform-core/trpc";

// Re-export dep setters for initialization
export { setOrgRouterDeps } from "./routers/org.js";
export { setProfileRouterDeps } from "./routers/profile.js";
export { setSettingsRouterDeps } from "./routers/settings.js";
