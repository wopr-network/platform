"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import type {
  CacheStats,
  DailyCostAggregate,
  PageCostAggregate,
  SessionCostSummary,
} from "@/lib/admin-inference-api";
import {
  getCacheStats,
  getDailyCost,
  getPageCost,
  getSessionCost,
} from "@/lib/admin-inference-api";
import { cn } from "@/lib/utils";

// ---- Time ranges ----

type TimeRange = "7d" | "30d" | "90d" | "all";

const RANGE_MS: Record<TimeRange, number> = {
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000,
  all: 365 * 10 * 24 * 60 * 60 * 1000,
};

// ---- Animated number hook ----

function useAnimatedNumber(target: number, duration = 400): number {
  const [value, setValue] = useState(target);
  const rafRef = useRef<number>(0);
  const prevRef = useRef<number>(target);

  useEffect(() => {
    const from = prevRef.current;
    prevRef.current = target;
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - (1 - progress) ** 3; // easeOutCubic
      setValue(from + (target - from) * eased);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return value;
}

// ---- KPI Card ----

interface KpiCardProps {
  label: string;
  value: string;
  subtext?: string;
  valueClassName?: string;
  loading?: boolean;
  index: number;
}

function KpiCard({ label, value, subtext, valueClassName, loading, index }: KpiCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="bg-card border border-border rounded-sm p-4 transition-colors duration-150 hover:border-terminal/40"
    >
      <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">{label}</div>
      {loading ? (
        <div className="h-8 w-24 bg-muted animate-pulse rounded-sm" />
      ) : (
        <div className={`text-2xl font-bold tabular-nums ${valueClassName ?? "text-foreground"}`}>
          {value}
        </div>
      )}
      {subtext && <div className="text-xs text-muted-foreground mt-1">{subtext}</div>}
    </motion.div>
  );
}

// ---- Chart Tooltip ----

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-terminal/30 rounded-sm shadow-lg shadow-terminal/5 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-bold tabular-nums text-foreground">
        ${payload[0].value.toFixed(4)}
      </div>
    </div>
  );
}

// ---- Main Dashboard ----

export function InferenceDashboard() {
  const [range, setRange] = useState<TimeRange>("30d");
  const [loading, setLoading] = useState(true);
  const [dailyCost, setDailyCost] = useState<DailyCostAggregate[]>([]);
  const [pageCost, setPageCost] = useState<PageCostAggregate[]>([]);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [sessionCost, setSessionCost] = useState<SessionCostSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (r: TimeRange) => {
    setLoading(true);
    setError(null);
    const since = Date.now() - RANGE_MS[r];
    try {
      const [daily, pages, cache, session] = await Promise.all([
        getDailyCost(since),
        getPageCost(since),
        getCacheStats(since),
        getSessionCost(since),
      ]);
      setDailyCost(daily);
      setPageCost(pages);
      setCacheStats(cache);
      setSessionCost(session);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load inference data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(range);
  }, [range, loadData]);

  const totalCost = sessionCost?.totalCostUsd ?? 0;
  const totalSessions = sessionCost?.totalSessions ?? 0;
  const avgCost = sessionCost?.avgCostPerSession ?? 0;
  const hitRate = cacheStats?.hitRate ?? 0;

  const animatedTotalCost = useAnimatedNumber(totalCost);
  const animatedSessions = useAnimatedNumber(totalSessions);
  const animatedAvgCost = useAnimatedNumber(avgCost);
  const animatedHitRate = useAnimatedNumber(hitRate * 100);

  const maxPageCost = Math.max(...pageCost.map((p) => p.totalCostUsd), 0);

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-6 pb-4">
        <h1 className="text-lg font-bold text-terminal">
          <span className="text-muted-foreground">&gt;</span> Inference Cost Monitor
        </h1>
        <div className="flex gap-1">
          {(["7d", "30d", "90d", "all"] as TimeRange[]).map((r) => (
            <Button
              key={r}
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => setRange(r)}
              className={cn(
                "font-mono transition-colors duration-150 hover:bg-transparent",
                range === r
                  ? "bg-terminal/10 text-terminal border border-terminal/20"
                  : "bg-secondary text-muted-foreground hover:bg-secondary/80",
              )}
            >
              {r}
            </Button>
          ))}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="mx-6 p-4 bg-card border border-destructive/30 rounded-sm text-destructive text-sm">
          {error}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-3 xl:grid-cols-5 gap-3 px-6">
        <KpiCard
          index={0}
          label="TOTAL COST"
          value={loading ? "" : `$${animatedTotalCost.toFixed(4)}`}
          subtext={`last ${range}`}
          loading={loading}
        />
        <KpiCard
          index={1}
          label="AVG COST / SESSION"
          value={loading ? "" : `$${animatedAvgCost.toFixed(4)}`}
          loading={loading}
        />
        <KpiCard
          index={2}
          label="TOTAL SESSIONS"
          value={loading ? "" : Math.round(animatedSessions).toLocaleString()}
          loading={loading}
        />
        <KpiCard
          index={3}
          label="CACHE HIT RATE"
          value={loading ? "" : `${animatedHitRate.toFixed(1)}%`}
          valueClassName="text-terminal"
          loading={loading}
        />
        <KpiCard
          index={4}
          label="COST / CONVERSION"
          value={loading ? "" : "N/A"}
          subtext="requires signup tracking"
          loading={loading}
        />
      </div>

      {/* Daily Cost Chart */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.2, ease: "easeOut" }}
        className="mx-6 bg-card border border-border rounded-sm p-4"
      >
        <div className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
          DAILY COST
        </div>
        {loading ? (
          <div className="h-[280px] bg-muted/20 animate-pulse rounded-sm" />
        ) : dailyCost.length === 0 ? (
          <div className="h-[280px] flex items-center justify-center text-muted-foreground text-xs">
            No usage data yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={dailyCost}>
              <CartesianGrid stroke="#00ff410d" vertical={false} />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 10, fill: "#666666" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: string) => {
                  const d = new Date(v);
                  return `${d.getMonth() + 1}/${d.getDate()}`;
                }}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#666666" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `$${v.toFixed(2)}`}
              />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="totalCostUsd"
                stroke="#00ff41"
                strokeWidth={1.5}
                fill="#00ff411a"
                activeDot={{ r: 4, stroke: "#00ff41", fill: "#000000", strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </motion.div>

      {/* Bottom grid: Page cost table + Cache panel */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 px-6 pb-6">
        {/* Page Cost Table */}
        <div className="bg-card border border-border rounded-sm p-4">
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
            COST BY PAGE
          </div>
          {loading ? (
            <div className="space-y-3">
              {["sk-1", "sk-2", "sk-3", "sk-4", "sk-5"].map((id) => (
                <div key={id} className="h-4 bg-muted animate-pulse rounded-sm" />
              ))}
            </div>
          ) : pageCost.length === 0 ? (
            <div className="text-center text-muted-foreground text-xs py-8">No page data</div>
          ) : (
            <div>
              <div className="flex text-xs uppercase tracking-widest text-muted-foreground border-b border-border pb-2 mb-2">
                <div className="flex-1">Page</div>
                <div className="w-20 text-right">Sessions</div>
                <div className="w-24 text-right">Avg Cost</div>
                <div className="w-24 text-right">Total</div>
              </div>
              {pageCost.map((p) => (
                <div
                  key={p.page}
                  className="flex items-center py-1.5 border-b border-border last:border-0 transition-colors duration-100 hover:bg-secondary/50"
                >
                  <div className="flex-1 text-sm font-medium">{p.page || "/unknown"}</div>
                  <div className="w-20 text-right tabular-nums text-sm">{p.callCount}</div>
                  <div className="w-24 text-right tabular-nums text-sm">
                    ${p.avgCostUsd.toFixed(4)}
                  </div>
                  <div
                    className={`w-24 text-right tabular-nums text-sm font-medium ${
                      p.totalCostUsd === maxPageCost && maxPageCost > 0
                        ? "text-amber-400"
                        : "text-foreground"
                    }`}
                  >
                    ${p.totalCostUsd.toFixed(4)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cache Performance Panel */}
        <div className="bg-card border border-border rounded-sm p-4">
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
            CACHE PERFORMANCE
          </div>
          {loading ? (
            <div className="space-y-4">
              <div className="h-10 w-24 bg-muted animate-pulse rounded-sm" />
              <div className="h-2 bg-muted animate-pulse rounded-full" />
            </div>
          ) : (
            <>
              <div className="text-4xl font-bold text-terminal tabular-nums">
                {((cacheStats?.hitRate ?? 0) * 100).toFixed(1)}%
              </div>
              <div className="text-xs text-muted-foreground mb-4">
                of input tokens served from cache
              </div>

              {/* Hit rate bar */}
              <div className="relative mb-4">
                <div className="h-2 rounded-full bg-secondary overflow-hidden">
                  <motion.div
                    className="h-full bg-terminal rounded-full"
                    initial={{ width: "0%" }}
                    animate={{ width: `${(cacheStats?.hitRate ?? 0) * 100}%` }}
                    transition={{ duration: 0.8, delay: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
                  />
                </div>
                {/* Target marker at 60% */}
                <div
                  className="absolute top-3 text-muted-foreground text-[10px] flex items-center gap-0.5"
                  style={{ left: "60%" }}
                >
                  TARGET: 60%
                  {(cacheStats?.hitRate ?? 0) >= 0.6 && (
                    <Check className="text-terminal" size={10} />
                  )}
                </div>
              </div>

              {/* Breakdown */}
              <div className="space-y-0">
                <div className="flex justify-between text-xs py-1">
                  <span className="text-terminal">Cache reads</span>
                  <span className="tabular-nums text-terminal">
                    {(cacheStats?.cachedTokens ?? 0).toLocaleString()} tokens
                  </span>
                </div>
                <div className="flex justify-between text-xs py-1">
                  <span className="text-cyan-400">Cache writes</span>
                  <span className="tabular-nums text-cyan-400">
                    {(cacheStats?.cacheWriteTokens ?? 0).toLocaleString()} tokens
                  </span>
                </div>
                <div className="flex justify-between text-xs py-1">
                  <span className="text-muted-foreground">Uncached</span>
                  <span className="tabular-nums text-muted-foreground">
                    {(cacheStats?.uncachedTokens ?? 0).toLocaleString()} tokens
                  </span>
                </div>
              </div>

              {(cacheStats?.hitRate ?? 0) === 0 && (
                <div className="text-xs text-muted-foreground mt-4">
                  Awaiting first cached request
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
