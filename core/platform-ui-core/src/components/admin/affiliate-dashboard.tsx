"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  blockAffiliateFingerprint,
  type FingerprintCluster,
  getAffiliateFingerprintClusters,
  getAffiliateSuppressions,
  getAffiliateVelocity,
  type SuppressionEvent,
  type VelocityReferrer,
} from "@/lib/admin-affiliate-api";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;
const CAP_REFERRALS = 20;
const CAP_PAYOUT_CENTS = 20000;

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

const panelVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, delay: i * 0.1 },
  }),
};

// --- Panel 1: Suppression Event Feed ---

function SuppressionFeed() {
  const [events, setEvents] = useState<SuppressionEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async (pageOffset: number) => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await getAffiliateSuppressions(PAGE_SIZE, pageOffset);
      setEvents(result.events);
      setTotal(result.total);
    } catch {
      setLoadError("Failed to load suppression events. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(offset);
  }, [load, offset]);

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-foreground">Suppression Events</h2>
      <div className="rounded-sm border border-terminal/10">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary crt-scanlines">
              <TableHead className="text-xs font-medium uppercase tracking-wider">
                Referrer
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider">
                Referred
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider">
                Signals
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider">Phase</TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider">When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody
            className={cn(
              "transition-opacity duration-150",
              loading && events.length > 0 && "opacity-60",
            )}
          >
            {loading && events.length === 0 ? (
              Array.from({ length: 5 }).map((_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows
                <TableRow key={`skel-${i}`} className="h-10">
                  {Array.from({ length: 5 }).map((_, j) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: skeleton cells
                    <TableCell key={`skel-${i}-${j}`}>
                      <Skeleton className="h-4 w-full" style={{ animationDelay: `${i * 50}ms` }} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : loadError ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center">
                  <p className="text-sm text-destructive font-mono">{loadError}</p>
                </TableCell>
              </TableRow>
            ) : events.length === 0 && !loading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center">
                  <p className="text-sm text-muted-foreground font-mono">
                    &gt; No suppression events recorded
                    <span className="animate-ellipsis" />
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Anti-fraud system has not triggered any blocks yet
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              events.map((e) => (
                <TableRow key={e.id} className="h-10 hover:bg-secondary/50">
                  <TableCell className="font-mono text-sm cursor-pointer hover:text-terminal hover:underline">
                    <Link href={`/admin/tenants?search=${e.referrerTenantId}`}>
                      {e.referrerTenantId}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{e.referredTenantId}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {e.signals.map((s) => (
                        <Badge
                          key={s}
                          variant="secondary"
                          className="bg-red-500/15 text-red-400 border border-red-500/20 text-xs"
                        >
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{e.phase}</TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {timeAgo(e.createdAt)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-xs text-muted-foreground font-mono">
          <span>
            Showing {offset + 1}-{Math.min(offset + PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="xs"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              Previous
            </Button>
            <Button
              variant="ghost"
              size="xs"
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Panel 2: High-Velocity Referrers ---

function VelocityPanel() {
  const [referrers, setReferrers] = useState<VelocityReferrer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const result = await getAffiliateVelocity(CAP_REFERRALS, CAP_PAYOUT_CENTS);
        setReferrers(result);
      } catch {
        setLoadError("Failed to load velocity data. Please try again.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-foreground">High-Velocity Referrers (30d)</h2>
      <div className="rounded-sm border border-terminal/10">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary crt-scanlines">
              <TableHead className="text-xs font-medium uppercase tracking-wider">
                Referrer
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider">
                30d Payouts
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider">
                30d Total
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody
            className={cn(
              "transition-opacity duration-150",
              loading && referrers.length > 0 && "opacity-60",
            )}
          >
            {loading && referrers.length === 0 ? (
              Array.from({ length: 3 }).map((_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows
                <TableRow key={`skel-${i}`} className="h-10">
                  {Array.from({ length: 4 }).map((_, j) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: skeleton cells
                    <TableCell key={`skel-${i}-${j}`}>
                      <Skeleton className="h-4 w-full" style={{ animationDelay: `${i * 50}ms` }} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : loadError ? (
              <TableRow>
                <TableCell colSpan={4} className="h-32 text-center">
                  <p className="text-sm text-destructive font-mono">{loadError}</p>
                </TableCell>
              </TableRow>
            ) : referrers.length === 0 && !loading ? (
              <TableRow>
                <TableCell colSpan={4} className="h-32 text-center">
                  <p className="text-sm text-muted-foreground font-mono">
                    &gt; No referral payouts in the last 30 days
                    <span className="animate-ellipsis" />
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              referrers.map((r) => {
                const payoutRatio = r.payoutCount30d / CAP_REFERRALS;
                const creditRatio = r.payoutTotal30dCents / CAP_PAYOUT_CENTS;
                const atCap = payoutRatio >= 1 || creditRatio >= 1;
                const nearCap = !atCap && (payoutRatio >= 0.8 || creditRatio >= 0.8);

                const countColor = atCap
                  ? "text-red-400"
                  : nearCap
                    ? "text-amber-400"
                    : "text-terminal";
                const rowBg = atCap ? "bg-red-500/5" : nearCap ? "bg-amber-500/5" : "";

                return (
                  <TableRow
                    key={r.referrerTenantId}
                    className={cn("h-10 hover:bg-secondary/50", rowBg)}
                  >
                    <TableCell className="font-mono text-sm cursor-pointer hover:text-terminal hover:underline">
                      <Link href={`/admin/tenants?search=${r.referrerTenantId}`}>
                        {r.referrerTenantId}
                      </Link>
                    </TableCell>
                    <TableCell className={cn("font-mono text-sm", countColor)}>
                      {r.payoutCount30d} / {CAP_REFERRALS}
                    </TableCell>
                    <TableCell className={cn("font-mono text-sm", countColor)}>
                      {formatCents(r.payoutTotal30dCents)} / {formatCents(CAP_PAYOUT_CENTS)}
                    </TableCell>
                    <TableCell>
                      {atCap && (
                        <Badge className="bg-red-500/15 text-red-400 border border-red-500/20 text-xs">
                          AT CAP
                        </Badge>
                      )}
                      {nearCap && (
                        <Badge className="bg-amber-500/15 text-amber-400 border border-amber-500/20 text-xs">
                          NEAR CAP
                        </Badge>
                      )}
                      {!atCap && !nearCap && (
                        <Badge className="bg-terminal/15 text-terminal border border-terminal/20 text-xs">
                          NORMAL
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// --- Panel 3: Same-Card Clusters ---

function FingerprintPanel() {
  const router = useRouter();
  const [clusters, setClusters] = useState<FingerprintCluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmingFingerprint, setConfirmingFingerprint] = useState<string | null>(null);
  const [blockingFingerprint, setBlockingFingerprint] = useState<string | null>(null);
  const [blockError, setBlockError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await getAffiliateFingerprintClusters();
      setClusters(result);
    } catch {
      toast.error("Failed to load fingerprint clusters. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleBlock = async (fingerprint: string) => {
    setBlockingFingerprint(fingerprint);
    setBlockError(null);
    try {
      await blockAffiliateFingerprint(fingerprint);
      setConfirmingFingerprint(null);
      await load();
    } catch {
      setBlockError("Failed to block fingerprint. Please try again.");
    } finally {
      setBlockingFingerprint(null);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Same-Card Clusters</h2>
        <p className="text-xs text-muted-foreground">
          Accounts sharing the same Stripe card fingerprint
        </p>
      </div>
      <div className="rounded-sm border border-terminal/10">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary crt-scanlines">
              <TableHead className="text-xs font-medium uppercase tracking-wider">
                Fingerprint
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider">
                Accounts
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody
            className={cn(
              "transition-opacity duration-150",
              loading && clusters.length > 0 && "opacity-60",
            )}
          >
            {loading && clusters.length === 0 ? (
              Array.from({ length: 3 }).map((_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows
                <TableRow key={`skel-${i}`} className="h-10">
                  {Array.from({ length: 3 }).map((_, j) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: skeleton cells
                    <TableCell key={`skel-${i}-${j}`}>
                      <Skeleton className="h-4 w-full" style={{ animationDelay: `${i * 50}ms` }} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : clusters.length === 0 && !loading ? (
              <TableRow>
                <TableCell colSpan={3} className="h-32 text-center">
                  <p className="text-sm text-muted-foreground font-mono">
                    &gt; No same-card clusters detected
                    <span className="animate-ellipsis" />
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    All payment fingerprints map to unique accounts
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              clusters.map((c) => (
                <TableRow key={c.stripeFingerprint} className="h-10 hover:bg-secondary/50">
                  <TableCell
                    className="font-mono text-sm text-muted-foreground"
                    title={c.stripeFingerprint}
                  >
                    {c.stripeFingerprint.substring(0, 10)}...
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {c.tenantIds.length >= 3 && (
                        <Badge className="bg-red-500/15 text-red-400 border border-red-500/20 text-xs">
                          {c.tenantIds.length} accounts
                        </Badge>
                      )}
                      {c.tenantIds.map((t) => (
                        <Badge key={t} variant="outline" className="text-xs font-mono">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          router.push(`/admin/tenants?search=${c.tenantIds.join(",")}`);
                        }}
                      >
                        Review
                      </Button>
                      {confirmingFingerprint === c.stripeFingerprint ? (
                        <>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="bg-red-600 hover:bg-red-700"
                            disabled={blockingFingerprint === c.stripeFingerprint}
                            onClick={() => handleBlock(c.stripeFingerprint)}
                          >
                            {blockingFingerprint === c.stripeFingerprint
                              ? "Blocking..."
                              : "Confirm Block?"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirmingFingerprint(null)}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setConfirmingFingerprint(c.stripeFingerprint)}
                        >
                          Block
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {blockError && <p className="text-xs text-red-400 font-mono mt-2">{blockError}</p>}
    </div>
  );
}

// --- Summary line helpers ---

function useSummary() {
  const [summary, setSummary] = useState({ suppressions: 0, nearCap: 0, clusters: 0 });

  useEffect(() => {
    (async () => {
      try {
        const [sup, vel, clust] = await Promise.all([
          getAffiliateSuppressions(1, 0),
          getAffiliateVelocity(CAP_REFERRALS, CAP_PAYOUT_CENTS),
          getAffiliateFingerprintClusters(),
        ]);
        const nearCapCount = vel.filter((r) => {
          const pr = r.payoutCount30d / CAP_REFERRALS;
          const cr = r.payoutTotal30dCents / CAP_PAYOUT_CENTS;
          return pr >= 0.8 || cr >= 0.8;
        }).length;
        setSummary({
          suppressions: sup.total,
          nearCap: nearCapCount,
          clusters: clust.length,
        });
      } catch {
        // keep zeros
      }
    })();
  }, []);

  return summary;
}

// --- Main Dashboard ---

export function AffiliateDashboard() {
  const summary = useSummary();

  return (
    <div className="p-6 space-y-8 max-w-6xl">
      <div>
        <h1 className="text-xl font-bold uppercase tracking-wider text-terminal [text-shadow:0_0_10px_rgba(0,255,65,0.25)]">
          AFFILIATE OPS
        </h1>
        <p className="text-sm text-muted-foreground font-mono mt-1">
          {summary.suppressions} suppressions | {summary.nearCap} referrers near cap |{" "}
          {summary.clusters} card clusters
        </p>
      </div>

      <motion.div custom={0} variants={panelVariants} initial="hidden" animate="visible">
        <SuppressionFeed />
      </motion.div>

      <motion.div custom={1} variants={panelVariants} initial="hidden" animate="visible">
        <VelocityPanel />
      </motion.div>

      <motion.div custom={2} variants={panelVariants} initial="hidden" animate="visible">
        <FingerprintPanel />
      </motion.div>
    </div>
  );
}
