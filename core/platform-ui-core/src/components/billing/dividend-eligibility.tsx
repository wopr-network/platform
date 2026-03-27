"use client";

import { motion } from "framer-motion";
import { ClockIcon } from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface DividendEligibilityProps {
  windowExpiresAt: string | null;
  eligible: boolean;
}

export function DividendEligibility({ windowExpiresAt, eligible }: DividendEligibilityProps) {
  if (!eligible || !windowExpiresAt) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <ClockIcon className="size-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-sm font-medium">Not in the pool</p>
                <p className="text-xs text-muted-foreground">
                  <Link href="#buy" className="text-terminal underline underline-offset-4">
                    Buy credits
                  </Link>{" "}
                  to start earning daily dividends
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  const now = Date.now();
  const expiresMs = new Date(windowExpiresAt).getTime();
  const daysRemaining = Math.max(0, Math.ceil((expiresMs - now) / 86400000));
  const progressPercent = (daysRemaining / 7) * 100;
  const isExpiringSoon = daysRemaining <= 2;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ClockIcon
              className={cn(
                "size-4 shrink-0",
                isExpiringSoon ? "text-terminal-dim" : "text-terminal",
              )}
            />
            <p className="text-sm font-medium">
              You&apos;re in the pool for{" "}
              <span
                className={cn("font-bold", isExpiringSoon ? "text-terminal-dim" : "text-terminal")}
              >
                {daysRemaining}
              </span>{" "}
              more day{daysRemaining === 1 ? "" : "s"}
            </p>
          </div>
          <Progress
            value={progressPercent}
            className="h-2"
            aria-label={`${daysRemaining} days remaining in dividend pool`}
          />
          {isExpiringSoon && (
            <p className="text-xs text-terminal-dim">Buy credits to reset your 7-day window</p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
