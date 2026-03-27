"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DegradedStateBanner } from "@/components/billing/degraded-state-banner";
import { LowBalanceBanner } from "@/components/billing/low-balance-banner";
import { Banner } from "@/components/ui/banner";
import type { BillingUsageSummary } from "@/lib/api";
import { getBillingUsageSummary, getCreditBalance } from "@/lib/api";
import { formatCreditStandard } from "@/lib/format-credit";

export function SuspensionBanner() {
  const [balance, setBalance] = useState<number | null>(null);
  const [runway, setRunway] = useState<number | null>(null);
  const [summary, setSummary] = useState<BillingUsageSummary | null>(null);

  const load = useCallback(async () => {
    try {
      const [data, summaryData] = await Promise.all([
        getCreditBalance(),
        getBillingUsageSummary().catch(() => null),
      ]);
      setBalance(data.balance);
      setRunway(data.runway);
      setSummary(summaryData);
    } catch {
      // Non-critical — don't block rendering
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (balance === null) return null;

  return (
    <>
      <DegradedStateBanner />
      <LowBalanceBanner balance={balance} runway={runway} global />
      {summary && summary.amountDue > 0 && (
        <Banner variant="warning" role="alert">
          <span className="flex-1">
            {formatCreditStandard(summary.amountDue)} due this billing period
          </span>
          <Link href="/billing/usage" className="font-semibold underline underline-offset-4">
            View usage
          </Link>
        </Banner>
      )}
    </>
  );
}
