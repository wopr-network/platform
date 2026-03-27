"use client";

import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { Activity, CreditCard, Plus, Puzzle, TrendingUpIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFleetSSE } from "@/hooks/use-fleet-sse";
import { usePaginationParams } from "@/hooks/use-pagination-params";
import type {
  ActivityEvent,
  BotStatusResponse,
  DividendWalletStats,
  FleetInstance,
  FleetResources,
} from "@/lib/api";
import {
  getActivityFeed,
  getDividendStats,
  getFleetResources,
  mapBotStatusToFleetInstance,
} from "@/lib/api";
import { productName } from "@/lib/brand-config";
import { toUserMessage } from "@/lib/errors";
import { formatRelativeTime } from "@/lib/format";
import { formatCreditStandard } from "@/lib/format-credit";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

function computeFleetStats(instances: FleetInstance[], resources: FleetResources | null) {
  const running = instances.filter((i) => i.status === "running").length;
  const stopped = instances.filter((i) => i.status === "stopped").length;
  const degraded = instances.filter(
    (i) => i.health === "degraded" || i.health === "unhealthy",
  ).length;
  const totalCpu = resources?.totalCpuPercent ?? 0;
  const totalMemory = resources?.totalMemoryMb ?? 0;
  const memoryCapacity = resources?.memoryCapacityMb ?? 2048;

  return { running, stopped, degraded, totalCpu, totalMemory, memoryCapacity };
}

// ---------------------------------------------------------------------------
// Inline components (no separate files per spec)
// ---------------------------------------------------------------------------

function BlinkingCursor() {
  return (
    <motion.span
      className="ml-1 inline-block text-primary"
      animate={{ opacity: [1, 1, 0, 0] }}
      transition={{
        duration: 1.06,
        repeat: Infinity,
        times: [0, 0.49, 0.5, 1],
        ease: "linear",
      }}
    >
      _
    </motion.span>
  );
}

function CountUp({ value, suffix = "" }: { value: number; suffix?: string }) {
  const motionValue = useMotionValue(0);
  const rounded = useTransform(motionValue, (v) => Math.round(v));
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);

  useEffect(() => {
    const from = prevRef.current;
    prevRef.current = value;

    const controls = animate(motionValue, value, {
      duration: from === 0 ? 1.0 : 0.6,
      ease: "easeOut",
    });

    return () => controls.stop();
  }, [value, motionValue]);

  useEffect(() => {
    const unsubscribe = rounded.on("change", (v) => setDisplay(v));
    return () => unsubscribe();
  }, [rounded]);

  return (
    <span>
      {display}
      {suffix}
    </span>
  );
}

function PulsingDot({ color, speed = 2 }: { color: string; speed?: number }) {
  return (
    <motion.span
      className={`size-2 rounded-full ${color}`}
      animate={{ scale: [1, 1.4, 1], opacity: [1, 0.6, 1] }}
      transition={{ duration: speed, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

// ---------------------------------------------------------------------------
// Framer-motion variants
// ---------------------------------------------------------------------------

const staggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
} as const;

const staggerItem = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: "easeOut" as const },
  },
} as const;

const activityContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
} as const;

const activityItem = {
  hidden: { opacity: 0, x: -8 },
  show: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.25, ease: "easeOut" as const },
  },
} as const;

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CommandCenter() {
  const [activityError, setActivityError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState(Date.now());
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [resources, setResources] = useState<FleetResources | null>(null);
  const [dividendStats, setDividendStats] = useState<DividendWalletStats | null>(null);

  const {
    data: rawFleetData,
    isLoading: loading,
    error: fleetError,
    dataUpdatedAt,
  } = trpc.fleet.listInstances.useQuery(undefined);

  const utils = trpc.useUtils();
  useFleetSSE(() => {
    utils.fleet.listInstances.invalidate();
  });

  useEffect(() => {
    if (dataUpdatedAt > 0) {
      setLastRefreshed(dataUpdatedAt);
    }
  }, [dataUpdatedAt]);

  const instances = useMemo(() => {
    const bots = (rawFleetData as { bots?: BotStatusResponse[] } | undefined)?.bots;
    if (!Array.isArray(bots)) return [];
    return bots.map(mapBotStatusToFleetInstance);
  }, [rawFleetData]);

  const error = fleetError ? toUserMessage(fleetError, "Failed to load fleet data") : null;

  const loadNonFleet = useCallback(async () => {
    setActivityError(null);
    const [activityResult, resourcesResult, dividendResult] = await Promise.allSettled([
      getActivityFeed(),
      getFleetResources(),
      getDividendStats(),
    ]);
    // Activity is supplementary — surface inline without killing fleet data
    if (activityResult.status === "fulfilled") {
      setActivity(activityResult.value);
    } else {
      setActivity([]);
      const err = activityResult.reason;
      setActivityError(toUserMessage(err, "Failed to load activity"));
    }
    // Resources are supplementary — silent null degradation
    setResources(resourcesResult.status === "fulfilled" ? resourcesResult.value : null);
    // Dividend stats are supplementary — silent null degradation
    setDividendStats(dividendResult.status === "fulfilled" ? dividendResult.value : null);
  }, []);

  useEffect(() => {
    loadNonFleet();
    const interval = setInterval(loadNonFleet, 30_000);
    return () => clearInterval(interval);
  }, [loadNonFleet]);

  const FLEET_PAGE_SIZE = 20;
  const { page: fleetPage, setPage: setFleetPage } = usePaginationParams(FLEET_PAGE_SIZE);

  const stats = computeFleetStats(instances, resources);

  const fleetTotal = instances.length;
  const fleetStart = (fleetPage - 1) * FLEET_PAGE_SIZE;
  const pagedInstances = instances.slice(fleetStart, fleetStart + FLEET_PAGE_SIZE);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">
          Command Center
          <BlinkingCursor />
        </h1>
        <div className="flex items-center gap-2">
          <p className="text-sm text-muted-foreground">Fleet overview and quick actions</p>
          <motion.div
            key={lastRefreshed}
            initial={{ scale: 1.4, opacity: 0.8 }}
            animate={{ scale: 1, opacity: 0.4 }}
            transition={{ duration: 1.5, ease: "easeOut" }}
            className="size-1.5 rounded-full bg-terminal"
          />
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div
          role="alert"
          className="flex items-center justify-between rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400"
        >
          <span>{error}</span>
          <Button
            data-onboarding-id="dashboard.retry"
            variant="ghost"
            size="sm"
            onClick={() => loadNonFleet()}
          >
            Retry
          </Button>
        </div>
      )}

      {/* Fleet Summary Cards */}
      <motion.div
        className={cn(
          "grid gap-4 sm:grid-cols-2",
          dividendStats ? "lg:grid-cols-5" : "lg:grid-cols-4",
        )}
        variants={staggerContainer}
        initial="hidden"
        animate="show"
      >
        {/* Running */}
        <motion.div variants={staggerItem}>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Running</p>
                <PulsingDot color="bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]" />
              </div>
              <p className="mt-2 text-3xl font-bold tabular-nums" data-testid="running-count">
                {loading ? "--" : <CountUp value={stats.running} />}
              </p>
              <p className="text-xs text-muted-foreground">
                {stats.running === 1 ? "instance" : "instances"}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Stopped */}
        <motion.div variants={staggerItem}>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Stopped</p>
                <span className="size-2 rounded-full bg-zinc-400" />
              </div>
              <p className="mt-2 text-3xl font-bold tabular-nums" data-testid="stopped-count">
                {loading ? "--" : <CountUp value={stats.stopped} />}
              </p>
              <p className="text-xs text-muted-foreground">
                {stats.stopped === 1 ? "instance" : "instances"}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Degraded */}
        <motion.div variants={staggerItem}>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Degraded</p>
                {stats.degraded > 0 ? (
                  <PulsingDot color="bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.4)]" speed={1.2} />
                ) : (
                  <span className="size-2 rounded-full bg-zinc-700" />
                )}
              </div>
              <p className="mt-2 text-3xl font-bold tabular-nums" data-testid="degraded-count">
                {loading ? "--" : <CountUp value={stats.degraded} />}
              </p>
              <p className="text-xs text-muted-foreground">
                {stats.degraded > 0 ? "need attention" : "all clear"}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Resources */}
        <motion.div variants={staggerItem}>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Resources</p>
              <div className="mt-2 space-y-2">
                <div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-muted-foreground">CPU</span>
                    <span className="text-sm font-bold tabular-nums" data-testid="cpu-usage">
                      {loading ? "--" : <CountUp value={stats.totalCpu} suffix="%" />}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <motion.div
                      className="h-full rounded-full bg-primary"
                      initial={{ width: "0%" }}
                      animate={{ width: loading ? "0%" : `${stats.totalCpu}%` }}
                      transition={{ duration: 0.8, ease: "easeOut", delay: 0.3 }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-muted-foreground">Memory</span>
                    <span className="text-sm font-bold tabular-nums" data-testid="memory-usage">
                      {loading ? "--" : <CountUp value={stats.totalMemory} suffix=" MB" />}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <motion.div
                      className="h-full rounded-full bg-primary"
                      initial={{ width: "0%" }}
                      animate={{
                        width: loading
                          ? "0%"
                          : `${Math.min(100, (stats.totalMemory / stats.memoryCapacity) * 100)}%`,
                      }}
                      transition={{ duration: 0.8, ease: "easeOut", delay: 0.3 }}
                    />
                  </div>
                </div>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">across fleet</p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Dividend */}
        {dividendStats && (
          <motion.div variants={staggerItem}>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Today&apos;s Dividend</p>
                  <TrendingUpIcon className="size-4 text-terminal" />
                </div>
                <p
                  className="mt-2 text-3xl font-bold tabular-nums text-terminal"
                  data-testid="dividend-amount"
                >
                  {loading ? "--" : formatCreditStandard((dividendStats?.perUserCents ?? 0) / 100)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {dividendStats?.userEligible ? "your daily share" : "join the pool to earn"}
                </p>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </motion.div>

      {/* Activity Feed */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Recent Activity
            <BlinkingCursor />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activityError ? (
            <div
              role="alert"
              className="flex flex-col items-center gap-2 py-8 text-center font-mono text-xs text-red-400"
            >
              <p>&gt; ACTIVITY UNAVAILABLE</p>
              <p className="text-muted-foreground">{activityError}</p>
            </div>
          ) : activity.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <p className="font-mono text-sm text-terminal">&gt; STANDING BY</p>
              <p className="font-mono text-xs text-muted-foreground">
                NO EVENTS LOGGED. AWAITING ACTIVITY.
              </p>
            </div>
          ) : (
            <motion.div
              className="space-y-0 divide-y divide-border"
              variants={activityContainer}
              initial="hidden"
              animate="show"
            >
              {activity.map((evt) => (
                <motion.div key={evt.id} variants={activityItem}>
                  <Link
                    href={evt.targetHref}
                    className="flex items-center justify-between py-2.5 text-sm transition-colors hover:text-primary"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant="secondary" className="shrink-0 text-xs">
                        {evt.actor}
                      </Badge>
                      <span className="text-muted-foreground">{evt.action}</span>
                      <span className="truncate font-medium">{evt.target}</span>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground ml-4">
                      {formatRelativeTime(evt.timestamp)}
                    </span>
                  </Link>
                </motion.div>
              ))}
            </motion.div>
          )}
        </CardContent>
      </Card>

      {/* Fleet Grid — bot cards + "Add another bot" CTA */}
      {!loading && pagedInstances.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pagedInstances.map((inst) => (
            <Link key={inst.id} href={`/instances/${inst.id}`}>
              <motion.div
                data-onboarding-id={`dashboard.bot.${inst.id}`}
                whileHover={{ y: -4, scale: 1.015 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
              >
                <Card className="h-full cursor-pointer transition-all hover:shadow-md hover:border-primary/30">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      {inst.status === "running" ? (
                        <PulsingDot color="bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]" />
                      ) : (
                        <span className="size-2 rounded-full bg-zinc-400" />
                      )}
                      <p className="font-semibold">{inst.name}</p>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground capitalize">{inst.status}</p>
                  </CardContent>
                </Card>
              </motion.div>
            </Link>
          ))}

          {/* Add another bot CTA card */}
          <Link data-onboarding-id="dashboard.add-bot" href="/instances/new">
            <motion.div
              className="h-full rounded-sm border border-dashed border-terminal/20"
              animate={{
                borderColor: [
                  "hsl(var(--terminal) / 0.2)",
                  "hsl(var(--terminal) / 0.5)",
                  "hsl(var(--terminal) / 0.2)",
                ],
              }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            >
              <Card className="flex h-full cursor-pointer items-center justify-center border-0 transition-all hover:shadow-md">
                <CardContent className="p-6 text-center">
                  <motion.div
                    className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border-2 border-terminal/30 text-terminal"
                    animate={{ scale: [1, 1.08, 1] }}
                    transition={{
                      repeat: Infinity,
                      duration: 2.5,
                      ease: "easeInOut",
                    }}
                  >
                    <Plus size={24} />
                  </motion.div>
                  <p className="font-semibold">Add another {productName()}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Name it. Teach it. Give it superpowers.
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          </Link>
        </div>
      )}

      {/* Fleet Pagination */}
      {fleetTotal > FLEET_PAGE_SIZE && (
        <div className="flex items-center justify-between text-xs text-muted-foreground font-mono">
          <span>
            Showing {fleetStart + 1}-{Math.min(fleetStart + FLEET_PAGE_SIZE, fleetTotal)} of{" "}
            {fleetTotal}
          </span>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="xs"
              disabled={fleetPage <= 1}
              onClick={() => setFleetPage(fleetPage - 1)}
            >
              Previous
            </Button>
            <Button
              variant="ghost"
              size="xs"
              disabled={fleetStart + FLEET_PAGE_SIZE >= fleetTotal}
              onClick={() => setFleetPage(fleetPage + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Button
          data-onboarding-id="dashboard.action.add-bot"
          asChild
          variant="terminal"
          size="lg"
          className="h-auto py-4 hover:shadow-[0_0_16px_rgba(0,255,65,0.25)]"
        >
          <Link href="/instances/new">
            <div className="flex items-center gap-3">
              <Plus size={18} />
              <div className="text-left">
                <p className="font-semibold">Add Another {productName()}</p>
                <p className="text-xs opacity-70">Grow your fleet</p>
              </div>
            </div>
          </Link>
        </Button>

        <Button
          data-onboarding-id="dashboard.action.fleet-health"
          asChild
          variant="outline"
          size="lg"
          className="h-auto py-4 hover:shadow-[0_0_12px_rgba(0,255,65,0.15)] hover:border-terminal/40"
        >
          <Link href="/fleet/health">
            <div className="flex items-center gap-3">
              <Activity size={18} />
              <div className="text-left">
                <p className="font-semibold">Fleet Health</p>
                <p className="text-xs opacity-70">Monitor all instances</p>
              </div>
            </div>
          </Link>
        </Button>

        <Button
          data-onboarding-id="dashboard.action.plugins"
          asChild
          variant="outline"
          size="lg"
          className="h-auto py-4 hover:shadow-[0_0_12px_rgba(0,255,65,0.15)] hover:border-terminal/40"
        >
          <Link href="/plugins">
            <div className="flex items-center gap-3">
              <Puzzle size={18} />
              <div className="text-left">
                <p className="font-semibold">Manage Plugins</p>
                <p className="text-xs opacity-70">Install and configure</p>
              </div>
            </div>
          </Link>
        </Button>

        <Button
          data-onboarding-id="dashboard.action.billing"
          asChild
          variant="outline"
          size="lg"
          className="h-auto py-4 hover:shadow-[0_0_12px_rgba(0,255,65,0.15)] hover:border-terminal/40"
        >
          <Link href="/billing/usage">
            <div className="flex items-center gap-3">
              <CreditCard size={18} />
              <div className="text-left">
                <p className="font-semibold">Billing Overview</p>
                <p className="text-xs opacity-70">Usage and costs</p>
              </div>
            </div>
          </Link>
        </Button>
      </div>
    </div>
  );
}
