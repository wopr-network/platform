"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CreditBalance as CreditBalanceData } from "@/lib/api";
import { formatCreditStandard } from "@/lib/format-credit";
import { cn } from "@/lib/utils";

function useCountUp(target: number, duration = 1200) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let raf: number;
    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - (1 - progress) ** 3;
      setValue(eased * target);
      if (progress < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

function balanceColor(balance: number, runway: number | null) {
  if (balance <= 2 || (runway !== null && runway <= 1)) return "text-destructive";
  if (balance <= 10 || (runway !== null && runway <= 7)) return "text-amber-500";
  return "text-primary dark:text-primary text-emerald-500";
}

export function CreditBalance({ data }: { data: CreditBalanceData }) {
  const animatedBalance = useCountUp(data.balance);

  const runwayText =
    data.runway === null
      ? "N/A"
      : data.runway === 0
        ? "Suspended"
        : `~${data.runway} day${data.runway === 1 ? "" : "s"}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      <Card>
        <CardHeader>
          <CardTitle>Credit Balance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className={cn("text-4xl font-bold font-mono", balanceColor(data.balance, data.runway))}
          >
            {formatCreditStandard(animatedBalance)}
          </div>
          <div className="flex flex-wrap gap-6 text-sm text-muted-foreground">
            <div>
              <span className="block text-xs uppercase tracking-wider text-primary/60">
                Daily burn
              </span>
              <span className="font-medium text-foreground">
                {formatCreditStandard(data.dailyBurn)}/day
              </span>
            </div>
            <div>
              <span className="block text-xs uppercase tracking-wider text-primary/60">Runway</span>
              <span className="font-medium text-foreground">{runwayText}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
