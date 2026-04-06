/**
 * Auth helpers — org membership checks via core-client.
 */
import { TRPCError } from "@trpc/server";
import { coreClient } from "../services/core-client.js";
import { logger } from "../logger.js";

/**
 * Assert the caller is an admin or owner of the tenant org.
 * For personal tenants (tenantId === userId), this is a no-op.
 * Delegates to core's org API for actual membership check.
 */
export async function assertOrgAdminOrOwner(tenantId: string, userId: string): Promise<void> {
  if (tenantId === userId) return;

  try {
    // Core validates org membership — if user isn't a member, this throws
    await coreClient({ tenantId, userId, product: "holyship" }).org.getOrganization.query();
  } catch (err) {
    logger.warn("Org membership check failed", { tenantId, userId, error: (err as Error).message });
    throw new TRPCError({ code: "FORBIDDEN", message: "Organization admin access required" });
  }
}
