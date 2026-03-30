/**
 * tRPC page-context router — stores and retrieves per-user page context.
 *
 * Pure platform-core — no product-specific imports.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { IPageContextRepository } from "../../fleet/page-context-repository.js";
import { protectedProcedure, router, type TRPCContext } from "../init.js";

// Narrowed context after protectedProcedure middleware (user is non-optional)
type ProtectedCtx = TRPCContext & { user: NonNullable<TRPCContext["user"]> };

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export interface PageContextRouterDeps {
  repo: IPageContextRepository;
}

let _deps: PageContextRouterDeps | null = null;

export function setPageContextRouterDeps(deps: PageContextRouterDeps): void {
  _deps = deps;
}

function deps(): PageContextRouterDeps {
  if (!_deps) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Page context not initialized" });
  return _deps;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const updatePageContextSchema = z.object({
  currentPage: z.string().min(1).max(500),
  pagePrompt: z.string().max(2000).nullable(),
});

// ---------------------------------------------------------------------------
// Factory — DI-based (preferred for new code)
// ---------------------------------------------------------------------------

export function createPageContextRouter(d: PageContextRouterDeps) {
  return router({
    update: protectedProcedure
      .input(updatePageContextSchema)
      .mutation(async ({ ctx, input }: { ctx: ProtectedCtx; input: z.infer<typeof updatePageContextSchema> }) => {
        await d.repo.set(ctx.user.id, input.currentPage, input.pagePrompt);
        return { ok: true as const };
      }),

    current: protectedProcedure.query(async ({ ctx }: { ctx: ProtectedCtx }) => {
      const pc = await d.repo.get(ctx.user.id);
      if (!pc) return null;
      return { currentPage: pc.currentPage, pagePrompt: pc.pagePrompt };
    }),
  });
}

// ---------------------------------------------------------------------------
// Singleton router (legacy — kept for backwards compat)
// ---------------------------------------------------------------------------

export const pageContextRouter = router({
  /** Update the page context for the current user. Called on route change. */
  update: protectedProcedure
    .input(updatePageContextSchema)
    .mutation(async ({ ctx, input }: { ctx: ProtectedCtx; input: z.infer<typeof updatePageContextSchema> }) => {
      await deps().repo.set(ctx.user.id, input.currentPage, input.pagePrompt);
      return { ok: true as const };
    }),

  /** Get the current page context for the authenticated user. */
  current: protectedProcedure.query(async ({ ctx }: { ctx: ProtectedCtx }) => {
    const pc = await deps().repo.get(ctx.user.id);
    if (!pc) return null;
    return { currentPage: pc.currentPage, pagePrompt: pc.pagePrompt };
  }),
});
