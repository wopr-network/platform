/**
 * Auth Social Router — exposes which OAuth providers are configured.
 *
 * Returns a list of provider IDs (e.g., ["github", "google"]) based on
 * which env vars are set. Used by platform-ui-core's OAuthButtons component.
 */

import { publicProcedure, router } from "./init.js";

const PROVIDERS = [
  { id: "github", envKey: "GITHUB_CLIENT_ID" },
  { id: "google", envKey: "GOOGLE_CLIENT_ID" },
  { id: "discord", envKey: "DISCORD_CLIENT_ID" },
] as const;

export const authSocialRouter = router({
  enabledSocialProviders: publicProcedure.query(() => {
    return PROVIDERS.filter((p) => process.env[p.envKey]).map((p) => p.id);
  }),
});
