"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CoinsIcon,
  GiftIcon,
  RotateCcwIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  WrenchIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { CreditTransaction, CreditTransactionType } from "@/lib/api";
import { getCreditHistory } from "@/lib/api";
import { formatCreditStandard } from "@/lib/format-credit";
import { cn } from "@/lib/utils";

const TYPE_CONFIG: Record<CreditTransactionType, { icon: typeof ArrowUpIcon; label: string }> = {
  purchase: { icon: ArrowUpIcon, label: "Purchase" },
  signup_credit: { icon: GiftIcon, label: "Signup credit" },
  bot_runtime: { icon: WrenchIcon, label: "Bot runtime" },
  refund: { icon: RotateCcwIcon, label: "Refund" },
  bonus: { icon: SparklesIcon, label: "Bonus" },
  adjustment: { icon: SlidersHorizontalIcon, label: "Adjustment" },
  community_dividend: { icon: CoinsIcon, label: "Dividend" },
};

const staggerItem = {
  hidden: { opacity: 0, x: -12 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: Math.min(i, 20) * 0.05, duration: 0.3, ease: "easeOut" as const },
  }),
};

export function TransactionHistory() {
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getCreditHistory();
      setTransactions(res.transactions);
      setCursor(res.nextCursor);
    } catch {
      setError("Failed to load transactions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const res = await getCreditHistory(cursor);
      setTransactions((prev) => [...prev, ...res.transactions]);
      setCursor(res.nextCursor);
    } catch {
      setError("Failed to load more transactions.");
    } finally {
      setLoadingMore(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 4 }, (_, n) => `sk-${n}`).map((skId) => (
              <div key={skId} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Skeleton className="size-8 rounded-full" />
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error && transactions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-20 flex-col items-center justify-center gap-2 text-muted-foreground">
            <p>{error}</p>
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={loadInitial}
              className="h-auto p-0"
            >
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transaction History</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {transactions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No transactions yet.</p>
        ) : (
          <>
            <div className="space-y-1">
              {transactions.map((tx, index) => {
                const config = TYPE_CONFIG[tx.type] ?? {
                  icon: ArrowDownIcon,
                  label: tx.type,
                };
                const Icon = config.icon;
                const isPositive = tx.amount > 0;
                const isHovered = hoveredId === tx.id;

                return (
                  <motion.div
                    key={tx.id}
                    variants={staggerItem}
                    initial="hidden"
                    animate="visible"
                    custom={index}
                    onMouseEnter={() => setHoveredId(tx.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    className={cn(
                      "rounded-md px-3 py-2 text-sm hover:bg-accent/50",
                      tx.type === "community_dividend" && "bg-terminal/5 border border-terminal/10",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Icon className="size-4 shrink-0 text-muted-foreground" />
                        <div>
                          <span className="font-medium">{tx.description}</span>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={tx.type === "community_dividend" ? "terminal" : "outline"}
                              className="text-xs"
                            >
                              {config.label}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(tx.createdAt).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                          </div>
                        </div>
                      </div>
                      <span
                        className={cn(
                          "font-mono font-medium",
                          isPositive ? "text-emerald-500" : "text-red-500",
                        )}
                      >
                        {isPositive ? "+" : "-"}
                        {formatCreditStandard(Math.abs(tx.amount))}
                      </span>
                    </div>
                    <AnimatePresence>
                      {isHovered && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                          className="overflow-hidden"
                        >
                          <div className="pt-2 pl-7 text-xs text-muted-foreground space-y-0.5">
                            <p>{tx.description}</p>
                            <p>
                              {new Date(tx.createdAt).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            {cursor && (
              <div className="pt-2">
                <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? "Loading more..." : "Load more"}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
