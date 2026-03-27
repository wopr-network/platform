"use client";

import { AnimatePresence, motion } from "framer-motion";
import { TrendingUpIcon } from "lucide-react";
import Link from "next/link";
import { useCountUp } from "@/hooks/use-count-up";
import type { DividendWalletStats } from "@/lib/api";
import { brandName } from "@/lib/brand-config";
import { formatCreditStandard } from "@/lib/format-credit";

interface DividendBannerProps {
  todayAmountCents: number;
  stats: DividendWalletStats;
}

type BannerState = "received" | "projected" | "ineligible";

function getBannerState(todayAmountCents: number, stats: DividendWalletStats): BannerState {
  if (!stats.userEligible) return "ineligible";
  if (todayAmountCents > 0) return "received";
  return "projected";
}

export function DividendBanner({ todayAmountCents, stats }: DividendBannerProps) {
  const state = getBannerState(todayAmountCents, stats);
  const animatedAmount = useCountUp(todayAmountCents / 100, 1200);

  return (
    <AnimatePresence mode="wait">
      {state === "received" && (
        <motion.div
          key="received"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="rounded-md border border-terminal/30 bg-terminal/10 px-6 py-5 shadow-[0_0_15px_rgba(0,255,65,0.15)]"
        >
          <div className="flex items-center gap-3">
            <TrendingUpIcon className="size-5 text-terminal shrink-0" />
            <div>
              <p className="text-lg font-bold text-terminal">
                {brandName()} paid you{" "}
                <span className="text-2xl font-bold font-mono tabular-nums">
                  {formatCreditStandard(animatedAmount)}
                </span>{" "}
                today.
              </p>
              <p className="text-sm text-muted-foreground">
                Community dividend from the daily pool
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {state === "projected" && (
        <motion.div
          key="projected"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="rounded-md border border-terminal/20 bg-terminal/5 px-6 py-4"
        >
          <div className="flex items-center gap-3">
            <TrendingUpIcon className="size-5 text-terminal-dim shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Your projected share: ~{formatCreditStandard(stats.perUserCents / 100)}/day
              </p>
              <p className="text-xs text-muted-foreground">Next distribution at midnight UTC</p>
            </div>
          </div>
        </motion.div>
      )}

      {state === "ineligible" && (
        <motion.div
          key="ineligible"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="rounded-md border border-terminal/20 bg-terminal/5 px-6 py-4"
        >
          <p className="text-sm text-muted-foreground">
            Purchase credits to join the community dividend pool.{" "}
            <Link href="#buy" className="font-semibold text-terminal underline underline-offset-4">
              Buy credits
            </Link>
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
