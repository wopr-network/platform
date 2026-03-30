/**
 * Server-side tRPC client for calling core from SSR / API routes / server actions.
 *
 * This client injects service-to-service auth headers so that core can identify
 * the calling product, tenant, and user without relying on browser session cookies.
 *
 * Environment variables (server-only — NEVER prefix with NEXT_PUBLIC_):
 *   CORE_SERVICE_TOKEN  — shared secret between this UI server and core
 *   INTERNAL_API_URL    — internal network URL (e.g. http://core:3001)
 *                         Falls back to NEXT_PUBLIC_API_URL → localhost:3001
 *
 * The browser-side tRPC client (trpc.tsx) still uses session cookies during the
 * transition period. Eventually all calls will flow through SSR → this client → core.
 */
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "./trpc-types";

export interface ServerTRPCContext {
  tenantId: string;
  userId: string;
  product: string;
  roles?: string[];
}

/**
 * Create a tRPC client for server-side calls to core.
 *
 * Each request context (SSR render, API route handler) should call this once
 * with the current user/tenant context extracted from the incoming request.
 */
export function createServerTRPCClient(ctx: ServerTRPCContext) {
  const serviceToken = process.env.CORE_SERVICE_TOKEN ?? "";
  const apiUrl = process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${apiUrl}/trpc`,
        headers: () => ({
          ...(serviceToken ? { Authorization: `Bearer ${serviceToken}` } : {}),
          "X-Tenant-Id": ctx.tenantId,
          "X-User-Id": ctx.userId,
          "X-Product": ctx.product,
          ...(ctx.roles?.length ? { "X-User-Roles": ctx.roles.join(",") } : {}),
        }),
      }),
    ],
  });
}
