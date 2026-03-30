/**
 * Auth Social Router — exposes which OAuth providers are configured.
 *
 * Returns a list of provider IDs (e.g., ["github", "google"]) based on
 * which providers have credentials in Vault. Used by platform-ui-core's
 * OAuthButtons component.
 */

import { getAuth } from "../auth/better-auth.js";
import { publicProcedure, router } from "./init.js";

export const authSocialRouter = router({
  enabledSocialProviders: publicProcedure.query(() => {
    const auth = getAuth();
    const providers: string[] = [];
    const opts = auth.options as { socialProviders?: Record<string, unknown> };
    if (opts.socialProviders) {
      for (const [id, config] of Object.entries(opts.socialProviders)) {
        if (config) providers.push(id);
      }
    }
    return providers;
  }),
});
