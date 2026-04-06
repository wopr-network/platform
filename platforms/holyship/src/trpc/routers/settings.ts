/**
 * Settings proxy — health is local, everything else delegates to core.
 */

import { z } from "zod";
import { coreClient } from "../../services/core-client.js";
import { publicProcedure, router, tenantProcedure } from "../init.js";

function forTenant(ctx: { tenantId: string; user: { id: string } }) {
  return coreClient({ tenantId: ctx.tenantId, userId: ctx.user.id, product: "holyship" });
}

export const settingsRouter = router({
  /** Health check — local to holyship. */
  health: publicProcedure.query(() => {
    return { status: "ok" as const, service: "holyship" };
  }),

  /** Tenant config — proxied to core. */
  tenantConfig: tenantProcedure.query(async ({ ctx }) => {
    return forTenant(ctx).settings.tenantConfig.query();
  }),

  /** Ping — proxied to core. */
  ping: tenantProcedure.query(async ({ ctx }) => {
    return forTenant(ctx).settings.ping.query();
  }),

  /** Notification preferences — proxied to core. */
  notificationPreferences: tenantProcedure.query(async ({ ctx }) => {
    return forTenant(ctx).settings.notificationPreferences.query();
  }),

  /** Update notification preferences — proxied to core. */
  updateNotificationPreferences: tenantProcedure
    .input(
      z.object({
        billing_low_balance: z.boolean().optional(),
        billing_receipts: z.boolean().optional(),
        billing_auto_topup: z.boolean().optional(),
        agent_channel_disconnect: z.boolean().optional(),
        agent_status_changes: z.boolean().optional(),
        account_role_changes: z.boolean().optional(),
        account_team_invites: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      return forTenant(ctx).settings.updateNotificationPreferences.mutate(input);
    }),
});
