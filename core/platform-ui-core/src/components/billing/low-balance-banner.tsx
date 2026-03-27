"use client";

import Link from "next/link";
import { Banner } from "@/components/ui/banner";

interface LowBalanceBannerProps {
  balance: number;
  runway: number | null;
  global?: boolean;
}

export function LowBalanceBanner({ balance, runway, global }: LowBalanceBannerProps) {
  if (balance > 2) return null;

  if (balance === 0) {
    return (
      <Banner variant="destructive" role="alert" className="animate-gentle-pulse">
        <span className="flex-1">Bots suspended — buy credits to reactivate</span>
        <Link href="/billing/credits" className="font-semibold underline underline-offset-4">
          Buy credits
        </Link>
      </Banner>
    );
  }

  if (balance < 1) {
    return (
      <Banner variant="destructive" role="alert" className="animate-gentle-pulse">
        <span className="flex-1">Credits critically low — buy now to avoid suspension</span>
        <Link href="/billing/credits" className="font-semibold underline underline-offset-4">
          Buy credits
        </Link>
      </Banner>
    );
  }

  // Balance $1.00 - $2.00: only show on credits page (not global)
  if (global) return null;

  const daysText = runway !== null ? `~${runway} day${runway === 1 ? "" : "s"} left` : "low";

  return (
    <Banner variant="warning" role="alert" className="animate-gentle-pulse">
      <span className="flex-1">Credits running low — {daysText}</span>
      <Link href="/billing/credits" className="font-semibold underline underline-offset-4">
        Top up now
      </Link>
    </Banner>
  );
}
