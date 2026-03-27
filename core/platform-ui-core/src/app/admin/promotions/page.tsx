"use client";

import { ChevronRight, MoreHorizontal, Pause, Play, Plus, XCircle } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toUserMessage } from "@/lib/errors";
import type { Promotion, PromotionStatus, PromotionType } from "@/lib/promotions-types";
import { trpcVanilla } from "@/lib/trpc";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<PromotionStatus, string> = {
  draft: "bg-secondary text-muted-foreground border border-border",
  scheduled: "bg-blue-500/15 text-blue-400 border border-blue-500/20",
  active: "bg-terminal/15 text-terminal border border-terminal/20",
  paused: "bg-yellow-500/15 text-yellow-400 border border-yellow-500/20",
  expired: "bg-secondary text-muted-foreground border border-border",
  cancelled: "bg-destructive/15 text-red-400 border border-destructive/20",
};

const TYPE_LABELS: Record<PromotionType, string> = {
  bonus_on_purchase: "Bonus on Purchase",
  coupon_fixed: "Coupon (Fixed)",
  coupon_unique: "Coupon (Unique)",
  batch_grant: "Batch Grant",
};

function formatWindow(startsAt: string | null, endsAt: string | null): string {
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (!startsAt) return "Immediate";
  if (!endsAt) return `${fmt(startsAt)} — no end`;
  return `${fmt(startsAt)} — ${fmt(endsAt)}`;
}

function formatCreditCount(n: number): string {
  return `${n.toLocaleString()} credits`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PromotionsListPage() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      try {
        const result = await trpcVanilla.promotions.list.query({
          status: statusFilter === "all" ? undefined : statusFilter,
          type: typeFilter === "all" ? undefined : typeFilter,
        });
        if (signal?.aborted) return;
        setPromotions(result as Promotion[]);
      } catch {
        // keep previous state
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [statusFilter, typeFilter],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function handleAction(id: string, action: "activate" | "pause" | "cancel") {
    setActionError(null);
    try {
      await (
        trpcVanilla.promotions[action as keyof typeof trpcVanilla.promotions] as {
          mutate: (input: { id: string }) => Promise<void>;
        }
      ).mutate({ id });
      await load();
    } catch (err) {
      setActionError(toUserMessage(err, `Failed to ${action} promotion`));
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Promotions</h1>
        <Button asChild size="sm">
          <Link href="/admin/promotions/new">
            <Plus className="h-4 w-4 mr-1.5" />
            New Promotion
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="bonus_on_purchase">Bonus on Purchase</SelectItem>
            <SelectItem value="coupon_fixed">Coupon (Fixed)</SelectItem>
            <SelectItem value="coupon_unique">Coupon (Unique)</SelectItem>
            <SelectItem value="batch_grant">Batch Grant</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Action error */}
      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }, (_, i) => `promo-sk-${i}`).map((id) => (
            <Skeleton key={id} className="h-12 w-full" />
          ))}
        </div>
      ) : promotions.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          No promotions found.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Window</TableHead>
              <TableHead className="text-right">Uses</TableHead>
              <TableHead className="text-right">Credits Granted</TableHead>
              <TableHead className="text-right">Budget</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {promotions.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">
                  <Link href={`/admin/promotions/${p.id}`} className="hover:underline">
                    {p.name}
                  </Link>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {TYPE_LABELS[p.type]}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className={cn("text-xs", STATUS_COLORS[p.status])}>
                    {p.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatWindow(p.startsAt, p.endsAt)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {p.totalUses}
                  {p.totalUseLimit !== null && (
                    <span className="text-muted-foreground">/{p.totalUseLimit}</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums text-terminal">
                  {formatCreditCount(p.totalCreditsGranted)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {p.budgetCap !== null ? formatCreditCount(p.budgetCap) : "—"}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link href={`/admin/promotions/${p.id}`}>
                          <ChevronRight className="h-4 w-4 mr-2" />
                          View Detail
                        </Link>
                      </DropdownMenuItem>
                      {(p.status === "draft" ||
                        p.status === "scheduled" ||
                        p.status === "paused") && (
                        <DropdownMenuItem onClick={() => handleAction(p.id, "activate")}>
                          <Play className="h-4 w-4 mr-2" />
                          Activate
                        </DropdownMenuItem>
                      )}
                      {p.status === "active" && (
                        <DropdownMenuItem onClick={() => handleAction(p.id, "pause")}>
                          <Pause className="h-4 w-4 mr-2" />
                          Pause
                        </DropdownMenuItem>
                      )}
                      {p.status !== "cancelled" && p.status !== "expired" && (
                        <DropdownMenuItem
                          onClick={() => handleAction(p.id, "cancel")}
                          className="text-destructive"
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Cancel
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
