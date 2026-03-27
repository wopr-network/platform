"use client";

import { motion } from "framer-motion";
import { UsersIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCreditStandard } from "@/lib/format-credit";

interface DividendPoolStatsProps {
  poolCents: number;
  activeUsers: number;
  perUserCents: number;
}

export function DividendPoolStats({
  poolCents,
  activeUsers,
  perUserCents,
}: DividendPoolStatsProps) {
  if (poolCents === 0 && activeUsers === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Community Pool</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Pool building... check back after the first purchase day.
            </p>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  const poolDollars = formatCreditStandard(poolCents / 100);
  const perUserDollars = formatCreditStandard(perUserCents / 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Community Pool</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-6 text-sm">
            <div>
              <span className="block text-xs uppercase tracking-wider text-primary/60">
                Today&apos;s pool
              </span>
              <span className="font-bold text-lg font-mono text-terminal">{poolDollars}</span>
            </div>
            <div>
              <span className="block text-xs uppercase tracking-wider text-primary/60">
                Active users
              </span>
              <span className="font-bold text-lg font-mono flex items-center gap-1.5">
                <UsersIcon className="size-4 text-muted-foreground" />
                {activeUsers}
              </span>
            </div>
            <div>
              <span className="block text-xs uppercase tracking-wider text-primary/60">
                Your share
              </span>
              <span className="font-bold text-lg font-mono text-terminal">
                {perUserDollars}/day
              </span>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {activeUsers} users in the pool &mdash; your share: ~{perUserDollars}/day
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}
