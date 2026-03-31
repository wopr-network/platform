/**
 * tRPC org-keys router — API key management per org.
 *
 * DI factory — no singletons.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { EncryptedPayload } from "../../security/types.js";
import { providerSchema } from "../../security/types.js";
import { router, tenantProcedure } from "../init.js";

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export interface OrgKeysRouterDeps {
  getTenantKeyRepository: () => {
    listForTenant: (tenantId: string) => Promise<unknown[]>;
    get: (
      tenantId: string,
      provider: string,
    ) => Promise<
      | {
          id: string;
          tenant_id: string;
          provider: string;
          label: string;
          created_at: number;
          updated_at: number;
        }
      | undefined
    >;
    upsert: (tenantId: string, provider: string, encryptedPayload: EncryptedPayload, label: string) => Promise<string>;
    delete: (tenantId: string, provider: string) => Promise<boolean>;
  };
  encrypt: (plaintext: string, key: Buffer) => EncryptedPayload;
  deriveTenantKey: (tenantId: string, platformSecret: string) => Buffer;
  platformSecret: string | undefined;
  getOrgTenantIdForUser: (userId: string, memberTenantId: string) => Promise<string | null>;
  getUserRoleInTenant: (userId: string, tenantId: string) => Promise<string | null>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createOrgKeysRouter(deps: OrgKeysRouterDeps) {
  async function requireOrgAdmin(userId: string, orgTenantId: string): Promise<void> {
    const role = await deps.getUserRoleInTenant(userId, orgTenantId);
    if (role !== "tenant_admin" && role !== "platform_admin") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only org tenant_admin can manage org keys",
      });
    }
  }

  async function resolveOrgTenantId(userId: string, memberTenantId: string): Promise<string> {
    const orgTenantId = await deps.getOrgTenantIdForUser(userId, memberTenantId);
    if (!orgTenantId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "No org membership found" });
    }
    return orgTenantId;
  }

  return router({
    listOrgKeys: tenantProcedure.query(async ({ ctx }) => {
      const orgTenantId = await resolveOrgTenantId(ctx.user.id, ctx.tenantId);
      const keys = await deps.getTenantKeyRepository().listForTenant(orgTenantId);
      return { orgTenantId, keys };
    }),

    getOrgKey: tenantProcedure.input(z.object({ provider: providerSchema })).query(async ({ input, ctx }) => {
      const orgTenantId = await resolveOrgTenantId(ctx.user.id, ctx.tenantId);
      const record = await deps.getTenantKeyRepository().get(orgTenantId, input.provider);
      if (!record) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No org key stored for this provider" });
      }
      return {
        id: record.id,
        tenant_id: record.tenant_id,
        provider: record.provider,
        label: record.label,
        created_at: record.created_at,
        updated_at: record.updated_at,
      };
    }),

    storeOrgKey: tenantProcedure
      .input(
        z.object({
          provider: providerSchema,
          apiKey: z.string().min(1),
          label: z.string().max(100).optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const orgTenantId = await resolveOrgTenantId(ctx.user.id, ctx.tenantId);
        await requireOrgAdmin(ctx.user.id, orgTenantId);

        if (!deps.platformSecret) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Platform secret not configured",
          });
        }

        const tenantKey = deps.deriveTenantKey(orgTenantId, deps.platformSecret);
        const encryptedPayload = deps.encrypt(input.apiKey, tenantKey);
        const maskedLabel = input.label ?? `...${input.apiKey.slice(-4)}`;
        const id = await deps
          .getTenantKeyRepository()
          .upsert(orgTenantId, input.provider, encryptedPayload, maskedLabel);

        return { ok: true as const, id, provider: input.provider };
      }),

    deleteOrgKey: tenantProcedure.input(z.object({ provider: providerSchema })).mutation(async ({ input, ctx }) => {
      const orgTenantId = await resolveOrgTenantId(ctx.user.id, ctx.tenantId);
      await requireOrgAdmin(ctx.user.id, orgTenantId);

      const deleted = await deps.getTenantKeyRepository().delete(orgTenantId, input.provider);
      if (!deleted) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No org key stored for this provider" });
      }
      return { ok: true as const, provider: input.provider };
    }),
  });
}
