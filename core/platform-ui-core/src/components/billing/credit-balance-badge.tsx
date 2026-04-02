"use client";

import { useCreditBalance } from "@/hooks/use-credit-balance";
import { formatCreditStandard } from "@/lib/format-credit";
import { cn } from "@/lib/utils";

function balanceColorClass(balance: number): string {
  if (balance <= 0) return "text-red-500";
  if (balance <= 2) return "text-amber-500";
  return "text-emerald-500";
}

/** Compact credit balance badge — use in sidebar, nav, etc. */
export function CreditBalanceBadge({ className }: { className?: string }) {
  const { balance } = useCreditBalance();
  if (balance == null) return null;
  return (
    <span className={cn("text-xs font-mono", balanceColorClass(balance), className)}>
      {formatCreditStandard(balance)}
    </span>
  );
}
