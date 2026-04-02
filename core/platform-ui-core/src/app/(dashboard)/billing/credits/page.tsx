"use client";

import { Suspense, useEffect, useState } from "react";
import { CreditBalance } from "@/components/billing/credit-balance";
import { DividendBanner } from "@/components/billing/dividend-banner";
import { DividendEligibility } from "@/components/billing/dividend-eligibility";
import { DividendPoolStats } from "@/components/billing/dividend-pool-stats";
import { FirstDividendDialog } from "@/components/billing/first-dividend-dialog";
import { LowBalanceBanner } from "@/components/billing/low-balance-banner";
import { TransactionHistory } from "@/components/billing/transaction-history";
import { UnifiedCheckout } from "@/components/billing/unified-checkout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { CreditBalance as CreditBalanceData, DividendWalletStats } from "@/lib/api";
import { getDividendStats } from "@/lib/api";
import { useSession } from "@/lib/auth-client";
import { getBrandConfig } from "@/lib/brand-config";
import { getOrganization } from "@/lib/org-api";
import { trpc } from "@/lib/trpc";

function CreditsContent() {
  const { data: session } = useSession();

  const [_orgContext, setOrgContext] = useState<{
    orgId: string;
    orgName: string;
    isAdmin: boolean;
  } | null>(null);
  const [orgChecked, setOrgChecked] = useState(false);

  useEffect(() => {
    getOrganization()
      .then((org) => {
        const currentMember = org.members.find(
          (m) => m.userId === session?.user?.id || (m.email && m.email === session?.user?.email),
        );
        setOrgContext({
          orgId: org.id,
          orgName: org.name,
          isAdmin: currentMember?.role === "owner" || currentMember?.role === "admin",
        });
      })
      .catch(() => {
        // No org — show personal billing
      })
      .finally(() => setOrgChecked(true));
  }, [session?.user?.email, session?.user?.id]);

  const showDividends = getBrandConfig().dividendsEnabled;
  const [dividendStats, setDividendStats] = useState<DividendWalletStats | null>(null);
  const [todayDividendCents, setTodayDividendCents] = useState(0);

  const {
    data: rawBalance,
    isLoading: loading,
    error: balanceError,
    refetch,
  } = trpc.billing.creditsBalance.useQuery({});

  const balance: CreditBalanceData | null = rawBalance
    ? {
        balance:
          ((rawBalance as { balance_credits?: number; balance_cents?: number }).balance_credits ??
            (rawBalance as { balance_cents?: number }).balance_cents ??
            0) / 100,
        dailyBurn:
          ((rawBalance as { daily_burn_credits?: number; daily_burn_cents?: number }).daily_burn_credits ??
            (rawBalance as { daily_burn_cents?: number }).daily_burn_cents ??
            0) / 100,
        runway: (rawBalance as { runway_days?: number | null }).runway_days ?? null,
      }
    : null;

  const error = balanceError ? "Failed to load credit balance." : null;

  useEffect(() => {
    if (!showDividends) return;
    getDividendStats()
      .then((statsData) => {
        if (statsData) {
          setDividendStats(statsData);
          if (statsData.userEligible && statsData.perUserCents > 0) {
            setTodayDividendCents(statsData.perUserCents);
          }
        }
      })
      .catch(() => null);
  }, [showDividends]);

  if (!orgChecked) {
    return (
      <div className="max-w-3xl space-y-6">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-20 w-full rounded-md" />
      </div>
    );
  }

  // Org billing view disabled — single-user mode for now.
  // When org features are re-enabled, restore: OrgBillingPage render here.

  if (loading) {
    return (
      <div className="max-w-3xl space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-20 w-full rounded-md" />
        <div className="rounded-sm border p-6 space-y-3">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="rounded-sm border p-6 space-y-3">
          <Skeleton className="h-5 w-28" />
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }, (_, n) => `sk-${n}`).map((skId) => (
              <Skeleton key={skId} className="h-16 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !balance) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
        <p>{error ?? "Unable to load credits."}</p>
        <Button variant="ghost" size="sm" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Credits</h1>
        <p className="text-sm text-muted-foreground">Purchase and manage your credits</p>
      </div>

      <LowBalanceBanner balance={balance.balance} runway={balance.runway} />

      {showDividends && dividendStats && <DividendBanner todayAmountCents={todayDividendCents} stats={dividendStats} />}

      <CreditBalance data={balance} />

      {showDividends && dividendStats && (
        <DividendEligibility
          windowExpiresAt={dividendStats.userWindowExpiresAt}
          eligible={dividendStats.userEligible}
        />
      )}

      {showDividends && dividendStats && (
        <DividendPoolStats
          poolCents={dividendStats.poolCents}
          activeUsers={dividendStats.activeUsers}
          perUserCents={dividendStats.perUserCents}
        />
      )}

      <UnifiedCheckout />
      <TransactionHistory />

      {showDividends && dividendStats && <FirstDividendDialog todayAmountCents={todayDividendCents} />}
    </div>
  );
}

export default function CreditsPage() {
  return (
    <Suspense fallback={null}>
      <CreditsContent />
    </Suspense>
  );
}
