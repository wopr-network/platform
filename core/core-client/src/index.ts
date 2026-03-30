import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { createCoreRouter } from "@wopr-network/platform-core/trpc";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The tRPC router type returned by createCoreRouter in platform-core. */
export type CoreRouter = ReturnType<typeof createCoreRouter>;

export interface CoreClientConfig {
  /** Core server URL (e.g., "http://core:3001") */
  url: string;
  /** Service token for authentication (e.g., "core_holyship_abc123") */
  serviceToken: string;
}

export interface RequestContext {
  tenantId: string;
  userId: string;
  product: string;
  roles?: string[];
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a typed tRPC client factory for the core server.
 *
 * Returns a function that, given per-request context (tenant, user, product),
 * returns a fully typed tRPC client with auth headers injected.
 *
 * Usage:
 * ```ts
 * const coreClient = createCoreClient({
 *   url: "http://core:3001",
 *   serviceToken: "core_holyship_xxx",
 * });
 *
 * // Per-request:
 * const client = coreClient({
 *   tenantId: "abc",
 *   userId: "u1",
 *   product: "holyship",
 * });
 * const balance = await client.billing.getBalance.query({ tenant: "abc" });
 * ```
 */
export function createCoreClient(config: CoreClientConfig) {
  return function forRequest(ctx: RequestContext) {
    return createTRPCClient<CoreRouter>({
      links: [
        httpBatchLink({
          url: `${config.url}/trpc`,
          headers: () => ({
            Authorization: `Bearer ${config.serviceToken}`,
            "X-Tenant-Id": ctx.tenantId,
            "X-User-Id": ctx.userId,
            "X-Product": ctx.product,
            ...(ctx.roles ? { "X-User-Roles": ctx.roles.join(",") } : {}),
          }),
        }),
      ],
    });
  };
}
