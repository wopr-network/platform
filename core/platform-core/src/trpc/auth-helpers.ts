/**
 * Shared auth helper factories for tRPC routers.
 *
 * These helpers can be constructed with explicit deps (for container-based DI)
 * instead of relying on module-level singletons.
 */

import { TRPCError } from "@trpc/server";
import type { IOrgMemberRepository } from "../tenancy/org-member-repository.js";

/**
 * Creates an assertOrgAdminOrOwner function closed over the given repository.
 *
 * Usage:
 * ```ts
 * const assertOrgAdmin = createAssertOrgAdminOrOwner(container.orgMemberRepo);
 * await assertOrgAdmin(tenantId, userId);
 * ```
 */
export function createAssertOrgAdminOrOwner(orgMemberRepo: IOrgMemberRepository) {
  return async function assertOrgAdminOrOwner(tenantId: string, userId: string): Promise<void> {
    if (tenantId === userId) return;
    const member = await orgMemberRepo.findMember(tenantId, userId);
    if (!member || (member.role !== "owner" && member.role !== "admin")) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Organization admin access required" });
    }
  };
}
