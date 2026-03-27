"use client";

import { motion } from "framer-motion";
import { AlertTriangleIcon, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useImageStatus } from "@/hooks/use-image-status";
import type { BotStatusResponse, FleetInstance, HealthStatus } from "@/lib/api";
import { mapBotStatusToFleetInstance } from "@/lib/api";
import { productName } from "@/lib/brand-config";
import { formatRelativeTime } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Health config — border, glow, dot color, animation speed, label
// ---------------------------------------------------------------------------

const healthConfig: Record<
  HealthStatus,
  {
    border: string;
    hoverShadow: string;
    dotColor: string;
    dotAnimation: string;
    label: string;
  }
> = {
  healthy: {
    border: "border-terminal/20",
    hoverShadow: "hover:shadow-[0_0_12px_rgba(0,255,65,0.1)]",
    dotColor: "bg-emerald-500",
    dotAnimation: "animate-[pulse-dot_2s_ease-in-out_infinite]",
    label: "Healthy",
  },
  degraded: {
    border: "border-amber-500/30",
    hoverShadow: "hover:shadow-[0_0_12px_rgba(245,158,11,0.15)]",
    dotColor: "bg-amber-500",
    dotAnimation: "animate-[pulse-dot_1.2s_ease-in-out_infinite]",
    label: "Degraded",
  },
  unhealthy: {
    border: "border-red-500/30",
    hoverShadow: "hover:shadow-[0_0_12px_rgba(239,68,68,0.15)]",
    dotColor: "bg-red-500",
    dotAnimation: "animate-[pulse-dot_0.6s_ease-in-out_infinite]",
    label: "Unhealthy",
  },
};

// ---------------------------------------------------------------------------
// Framer-motion variants
// ---------------------------------------------------------------------------

const cardContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
} as const;

const cardItem = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: "easeOut" as const },
  },
} as const;

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

type SortBy = "status" | "name" | "uptime";
type StatusFilter = "all" | "healthy" | "attention";

function sortInstances(instances: FleetInstance[], sortBy: SortBy): FleetInstance[] {
  return [...instances].sort((a, b) => {
    switch (sortBy) {
      case "status": {
        const order: Record<HealthStatus, number> = { unhealthy: 0, degraded: 1, healthy: 2 };
        return order[a.health] - order[b.health];
      }
      case "name":
        return a.name.localeCompare(b.name);
      case "uptime":
        return (b.uptime ?? 0) - (a.uptime ?? 0);
      default:
        return 0;
    }
  });
}

function formatUptime(seconds: number | null): string {
  if (seconds === null) return "--";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  if (d > 0) return `${d}d ${h}h`;
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FleetHealth() {
  const [sortBy, setSortBy] = useState<SortBy>("status");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const {
    data: rawData,
    isLoading: loading,
    error: queryError,
    refetch,
    isFetching,
    dataUpdatedAt,
  } = trpc.fleet.listInstances.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (dataUpdatedAt > 0) {
      setLastUpdated(new Date(dataUpdatedAt));
    }
  }, [dataUpdatedAt]);

  const instances = useMemo(() => {
    const bots = (rawData as { bots?: BotStatusResponse[] } | undefined)?.bots;
    if (!Array.isArray(bots)) return [];
    return bots.map(mapBotStatusToFleetInstance);
  }, [rawData]);

  const error = queryError ? "Failed to load fleet health — please try again." : null;
  const refreshing = isFetching && !loading;

  const sorted = sortInstances(instances, sortBy);

  const filtered = sorted.filter((inst) => {
    if (statusFilter === "healthy") return inst.health === "healthy";
    if (statusFilter === "attention")
      return inst.health === "degraded" || inst.health === "unhealthy";
    return true;
  });

  const healthyCt = instances.filter((i) => i.health === "healthy").length;
  const degradedCt = instances.filter((i) => i.health === "degraded").length;
  const unhealthyCt = instances.filter((i) => i.health === "unhealthy").length;
  const allHealthy = instances.length > 0 && degradedCt === 0 && unhealthyCt === 0;

  // --- Error state (no existing data) ---
  if (error && instances.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Fleet Health</h1>
        <div className="flex items-center gap-3 rounded-sm border border-destructive/30 bg-destructive/5 px-4 py-3">
          <AlertTriangleIcon className="size-5 shrink-0 text-destructive" />
          <p className="flex-1 text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="size-4" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // --- Skeleton loading state ---
  if (loading && instances.length === 0) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-px w-full" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, n) => `sk-${n}`).map((skId) => (
            <div key={skId} className="rounded-sm border border-terminal/10 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-2 w-2 rounded-full" />
              </div>
              <Skeleton className="h-4 w-20" />
              <div className="grid grid-cols-3 gap-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Fleet Summary Header */}
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Fleet Health</h1>

        {/* Status Bar */}
        <div className="flex flex-col gap-3 border-b border-terminal/20 pb-4 sm:flex-row sm:items-center sm:gap-6">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums font-mono">{instances.length}</span>
            <span className="text-sm text-muted-foreground">
              {instances.length === 1 ? "instance" : "instances"}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm font-mono">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-emerald-500" />
              <span className="text-emerald-500 tabular-nums">{healthyCt}</span>
              <span className="text-muted-foreground">running</span>
            </span>

            {degradedCt > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-amber-500" />
                <span className="text-amber-500 tabular-nums">{degradedCt}</span>
                <span className="text-muted-foreground">degraded</span>
              </span>
            )}

            {unhealthyCt > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-red-500" />
                <span className="text-red-500 tabular-nums">{unhealthyCt}</span>
                <span className="text-muted-foreground">unhealthy</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* All Systems Nominal Banner */}
      {allHealthy && (
        <div className="rounded-sm border border-terminal/20 bg-terminal/5 px-4 py-2 text-sm font-mono text-terminal">
          &gt; ALL SYSTEMS NOMINAL
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-[160px] border-terminal/20 font-mono text-xs">
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="healthy">Healthy Only</SelectItem>
            <SelectItem value="attention">Needs Attention</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
          <SelectTrigger className="w-[140px] border-terminal/20 font-mono text-xs">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="status">By Status</SelectItem>
            <SelectItem value="name">By Name</SelectItem>
            <SelectItem value="uptime">By Uptime</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="terminal" size="sm" onClick={() => refetch()} disabled={refreshing}>
          <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
          Refresh
        </Button>

        {lastUpdated && (
          <span className="text-xs text-muted-foreground font-mono">
            Updated {formatRelativeTime(lastUpdated)}
          </span>
        )}
      </div>

      {/* Instance Grid */}
      {filtered.length === 0 && instances.length === 0 ? (
        <div className="rounded-sm border border-terminal/20 bg-terminal/5 px-6 py-12 text-center font-mono">
          <p className="text-terminal">
            &gt; FLEET EMPTY. NO {productName().toUpperCase()} UNITS DEPLOYED.
          </p>
          <Link
            href="/instances/new"
            className="mt-4 inline-block text-sm text-muted-foreground underline underline-offset-4 hover:text-terminal"
          >
            Deploy your first instance
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-sm border border-terminal/20 bg-terminal/5 px-6 py-8 text-center font-mono text-sm text-muted-foreground">
          &gt; NO INSTANCES MATCH CURRENT FILTER
        </div>
      ) : (
        <motion.div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          variants={cardContainer}
          initial="hidden"
          animate="show"
          key={`${statusFilter}-${sortBy}`}
        >
          {filtered.map((inst) => (
            <motion.div key={inst.id} variants={cardItem}>
              <FleetHealthCard inst={inst} />
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}

function FleetHealthCard({ inst }: { inst: FleetInstance }) {
  const cfg = healthConfig[inst.health];
  const { updateAvailable } = useImageStatus(inst.id);

  return (
    <Link href={`/instances/${inst.id}`} className="block">
      <Card className={cn("transition-all", cfg.border, cfg.hoverShadow)}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="font-medium">{inst.name}</p>
              <p className="text-xs text-muted-foreground capitalize">{inst.provider}</p>
            </div>
            <div className="flex items-center gap-2">
              {updateAvailable && (
                <span className="text-[10px] font-mono uppercase tracking-wider text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded-sm">
                  UPD
                </span>
              )}
              <span className={cn("size-2 rounded-full", cfg.dotColor, cfg.dotAnimation)} />
              <span className="text-xs font-mono text-muted-foreground">{cfg.label}</span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
            <div>
              <p className="text-muted-foreground">Uptime</p>
              <p className="font-mono text-terminal tabular-nums">{formatUptime(inst.uptime)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Plugins</p>
              <p className="font-mono text-terminal tabular-nums">{inst.pluginCount}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Sessions</p>
              <p className="font-mono text-terminal tabular-nums">{inst.sessionCount}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
