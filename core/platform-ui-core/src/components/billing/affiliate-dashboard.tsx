"use client";

import { motion } from "framer-motion";
import { CheckCircle2Icon, ClockIcon, CopyIcon, ShareIcon, UsersIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { AffiliateStats, Referral } from "@/lib/api";
import { getAffiliateReferrals, getAffiliateStats } from "@/lib/api";
import { brandName } from "@/lib/brand-config";
import { formatCreditStandard } from "@/lib/format-credit";

function formatCents(cents: number): string {
  return formatCreditStandard(cents / 100);
}

export function AffiliateDashboard() {
  const [stats, setStats] = useState<AffiliateStats | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [offset, setOffset] = useState<number>(0);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsData, referralsData] = await Promise.all([
        getAffiliateStats(),
        getAffiliateReferrals(),
      ]);
      setStats(statsData);
      setReferrals(referralsData.referrals);
      setTotal(referralsData.total);
      setOffset(referralsData.referrals.length);
    } catch {
      setError("Failed to load referral data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCopy() {
    if (!stats) return;
    try {
      await navigator.clipboard.writeText(stats.referralUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  }

  async function handleShare() {
    if (!stats) return;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: `Join ${brandName()}`,
          text: "Get 20% extra credits on your first buy!",
          url: stats.referralUrl,
        });
      } catch {
        // User cancelled or share not supported
      }
    } else {
      // Fallback: copy to clipboard
      await handleCopy();
    }
  }

  async function handleLoadMore() {
    if (offset >= total) return;
    setLoadingMore(true);
    try {
      const res = await getAffiliateReferrals({ offset });
      setReferrals((prev) => [...prev, ...res.referrals]);
      setOffset((prev) => prev + res.referrals.length);
      setTotal(res.total);
    } catch {
      setError("Failed to load more referrals.");
    } finally {
      setLoadingMore(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="rounded-sm border p-6 space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-10 w-full" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-20" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }, (_, n) => `stat-sk-${n}`).map((skId) => (
            <Skeleton key={skId} className="h-20 w-full rounded-md" />
          ))}
        </div>
        <div className="rounded-sm border p-6 space-y-3">
          <Skeleton className="h-5 w-36" />
          {Array.from({ length: 3 }, (_, n) => `ref-sk-${n}`).map((skId) => (
            <Skeleton key={skId} className="h-12 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
        <p>{error}</p>
        <Button variant="ghost" size="sm" onClick={load}>
          Retry
        </Button>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Refer & Earn</h1>
        <p className="text-sm text-muted-foreground">
          Share your link and earn credits when friends join
        </p>
      </div>

      {/* Referral link card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Your referral link</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex-1 rounded-md border bg-muted/50 px-3 py-2 font-mono text-sm">
                {stats.referralUrl}
              </div>
              <Button variant="outline" size="sm" onClick={handleCopy} aria-label="Copy">
                <CopyIcon className="mr-1.5 size-4" />
                {copied ? "Copied!" : "Copy"}
              </Button>
              <Button variant="outline" size="sm" onClick={handleShare} aria-label="Share">
                <ShareIcon className="mr-1.5 size-4" />
                Share
              </Button>
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>When a friend joins with your link:</p>
              <ul className="list-disc pl-5 space-y-0.5">
                <li>
                  They get <strong>20% extra credits</strong> on their first buy
                </li>
                <li>
                  You get <strong>matching credits</strong> on their first buy
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Stats row */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1, ease: "easeOut" }}
        className="grid grid-cols-3 gap-3"
      >
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold">{stats.totalReferred}</div>
            <p className="text-xs text-muted-foreground mt-1">friends referred</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold">{stats.totalConverted}</div>
            <p className="text-xs text-muted-foreground mt-1">converted</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-emerald-500">
              {formatCents(stats.totalEarnedCents)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">earned</p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Recent referrals */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2, ease: "easeOut" }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Recent referrals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {referrals.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
                <UsersIcon className="size-8" />
                <p className="text-sm">No referrals yet. Share your link to get started!</p>
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  {referrals.map((ref, index) => (
                    <motion.div
                      key={ref.id}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        delay: Math.min(index, 20) * 0.05,
                        duration: 0.3,
                        ease: "easeOut",
                      }}
                      className="flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-accent/50"
                    >
                      <div className="flex items-center gap-3">
                        {ref.status === "matched" ? (
                          <CheckCircle2Icon className="size-4 shrink-0 text-emerald-500" />
                        ) : (
                          <ClockIcon className="size-4 shrink-0 text-amber-500" />
                        )}
                        <div>
                          <span className="font-medium">{ref.maskedEmail}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              Joined{" "}
                              {new Date(ref.joinedAt).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div>
                        {ref.status === "matched" ? (
                          <span className="font-mono font-medium text-emerald-500">
                            {formatCents(ref.matchAmountCents)}
                          </span>
                        ) : (
                          <Badge variant="outline" className="text-xs">
                            pending
                          </Badge>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                {offset < total && (
                  <div className="pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleLoadMore}
                      disabled={loadingMore}
                    >
                      {loadingMore ? "Loading more..." : "Load more"}
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
