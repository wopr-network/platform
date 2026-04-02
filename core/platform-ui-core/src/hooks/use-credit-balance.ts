"use client";

import { trpc } from "@/lib/trpc";

/** Shared credit balance hook — backed by tRPC React Query.
 *  Invalidating queryKey [["billing"]] updates every consumer. */
export function useCreditBalance() {
  const { data: raw, isLoading, error, refetch } = trpc.billing.creditsBalance.useQuery({});

  const balance =
    raw != null
      ? ((raw as { balance_credits?: number; balance_cents?: number }).balance_credits ??
          (raw as { balance_cents?: number }).balance_cents ??
          0) / 100
      : null;

  const dailyBurn =
    raw != null
      ? ((raw as { daily_burn_credits?: number; daily_burn_cents?: number }).daily_burn_credits ??
          (raw as { daily_burn_cents?: number }).daily_burn_cents ??
          0) / 100
      : null;

  const runway = raw != null ? ((raw as { runway_days?: number | null }).runway_days ?? null) : null;

  return { balance, dailyBurn, runway, isLoading, error, refetch };
}
