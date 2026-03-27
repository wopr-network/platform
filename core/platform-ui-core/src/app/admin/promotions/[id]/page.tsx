"use client";

import { ArrowLeft, Download } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Promotion, Redemption } from "@/lib/promotions-types";
import { trpcVanilla } from "@/lib/trpc";
import { cn } from "@/lib/utils";

const client = trpcVanilla;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-secondary text-muted-foreground border border-border",
  scheduled: "bg-blue-500/15 text-blue-400 border border-blue-500/20",
  active: "bg-terminal/15 text-terminal border border-terminal/20",
  paused: "bg-yellow-500/15 text-yellow-400 border border-yellow-500/20",
  expired: "bg-secondary text-muted-foreground border border-border",
  cancelled: "bg-destructive/15 text-red-400 border border-destructive/20",
};

function formatCredits(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatCreditCount(n: number): string {
  return `${n.toLocaleString()} credits`;
}

function timeRemaining(endsAt: string | null): string {
  if (!endsAt) return "No expiry";
  const diff = new Date(endsAt).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PromotionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [promo, setPromo] = useState<Promotion | null>(null);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [genCount, setGenCount] = useState(100);
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, r] = await Promise.all([
        client.promotions.get.query({ id }),
        client.promotions.listRedemptions.query({ promotionId: id, limit: 50 }),
      ]);
      setPromo(p);
      setRedemptions(r);
    } catch {
      setPromo(null);
      setRedemptions([]);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleGenerate() {
    setGenerating(true);
    setGenResult(null);
    try {
      const result = await client.promotions.generateCouponBatch.mutate({
        promotionId: id,
        count: genCount,
      });
      setGenResult(`Generated ${result.generated} codes`);
    } catch {
      setGenResult("Failed to generate codes");
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }, (_, i) => `stat-sk-${i}`).map((skId) => (
            <Skeleton key={skId} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (!promo) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Promotion not found.</p>
        <Button variant="ghost" size="sm" asChild className="mt-2">
          <Link href="/admin/promotions">
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back
          </Link>
        </Button>
      </div>
    );
  }

  const budgetUsedPercent =
    promo.budgetCap && promo.budgetCap > 0
      ? Math.min(100, (promo.totalCreditsGranted / promo.budgetCap) * 100)
      : null;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/promotions">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">{promo.name}</h1>
        <Badge variant="secondary" className={cn("text-xs", STATUS_COLORS[promo.status])}>
          {promo.status}
        </Badge>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground font-normal">Total Uses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {promo.totalUses}
              {promo.totalUseLimit !== null && (
                <span className="text-sm text-muted-foreground font-normal">
                  /{promo.totalUseLimit}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground font-normal">
              Credits Granted
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums text-terminal">
              {formatCreditCount(promo.totalCreditsGranted)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground font-normal">
              Budget Remaining
            </CardTitle>
          </CardHeader>
          <CardContent>
            {promo.budgetCap !== null ? (
              <div className="space-y-2">
                <div className="text-2xl font-bold tabular-nums">
                  {formatCreditCount(Math.max(0, promo.budgetCap - promo.totalCreditsGranted))}
                </div>
                <Progress value={budgetUsedPercent ?? 0} className="h-1.5" />
              </div>
            ) : (
              <div className="text-2xl font-bold text-muted-foreground">—</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground font-normal">
              Time Remaining
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{timeRemaining(promo.endsAt)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Generate codes button for coupon_unique */}
      {promo.type === "coupon_unique" && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-1.5" />
              Generate Codes
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Generate Coupon Codes</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label htmlFor="gen-count" className="text-sm font-medium block mb-1.5">
                  Number of codes
                </label>
                <Input
                  id="gen-count"
                  type="number"
                  min={1}
                  max={10000}
                  value={genCount}
                  onChange={(e) => {
                    const parsed = parseInt(e.target.value, 10);
                    if (!Number.isNaN(parsed)) setGenCount(parsed);
                  }}
                />
              </div>
              {genResult && <p className="text-sm text-muted-foreground">{genResult}</p>}
              <Button
                onClick={handleGenerate}
                disabled={generating || genCount < 1}
                className="w-full"
              >
                {generating ? "Generating..." : `Generate ${genCount} codes`}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Redemptions table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Redemptions</CardTitle>
        </CardHeader>
        <CardContent>
          {redemptions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No redemptions yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant ID</TableHead>
                  <TableHead className="text-right">Credits Granted</TableHead>
                  <TableHead className="text-right">Purchase Amount</TableHead>
                  <TableHead>Code Used</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {redemptions.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">
                      {r.tenantId.slice(0, 12)}...
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-terminal">
                      {formatCreditCount(r.creditsGranted)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.purchaseAmountCents !== null ? formatCredits(r.purchaseAmountCents) : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.couponCode ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
