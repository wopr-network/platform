"use client";

import { AlertTriangleIcon, CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { HealthStatus, PlatformHealthResponse } from "@/lib/api";
import { fetchPlatformHealth } from "@/lib/api";
import { brandName } from "@/lib/brand-config";
import { HEALTH_DOT_STYLES } from "@/lib/status-colors";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<HealthStatus, string> = {
  healthy: "Operational",
  degraded: "Degraded",
  unhealthy: "Down",
};

const BANNER_CONFIG: Record<
  HealthStatus,
  { text: string; border: string; bg: string; textColor: string }
> = {
  healthy: {
    text: "> ALL SYSTEMS OPERATIONAL",
    border: "border-terminal/20",
    bg: "bg-terminal/5",
    textColor: "text-terminal",
  },
  degraded: {
    text: "> PARTIAL DEGRADATION DETECTED",
    border: "border-amber-500/30",
    bg: "bg-amber-500/5",
    textColor: "text-amber-500",
  },
  unhealthy: {
    text: "> SYSTEM OUTAGE DETECTED",
    border: "border-red-500/30",
    bg: "bg-red-500/5",
    textColor: "text-red-500",
  },
};

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  if (d > 0) return `${d}d ${h}h`;
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function StatusIcon({ status }: { status: HealthStatus }) {
  switch (status) {
    case "healthy":
      return <CheckCircle2 className="size-4 text-emerald-500" />;
    case "degraded":
      return <AlertTriangleIcon className="size-4 text-amber-500" />;
    case "unhealthy":
      return <XCircle className="size-4 text-red-500" />;
  }
}

export function StatusPage() {
  const [health, setHealth] = useState<PlatformHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await fetchPlatformHealth();
      if (data) {
        setHealth(data);
        setError(false);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLastChecked(new Date());
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Platform Status</h1>
        <p className="text-sm text-muted-foreground">
          Real-time health of the {brandName()} platform.
        </p>
      </div>

      <div className="mt-8 space-y-6">
        {loading && !health && !error && (
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}

        {error && !health && !loading && (
          <div className="rounded-sm border border-red-500/30 bg-red-500/5 px-4 py-3">
            <div className="flex items-center gap-3">
              <XCircle className="size-5 shrink-0 text-red-500" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-500">
                  Unable to reach the {brandName()} platform
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  The health endpoint is not responding. The platform may be experiencing an outage.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={load} disabled={refreshing}>
                <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
                Retry
              </Button>
            </div>
          </div>
        )}

        {health && (
          <>
            {(() => {
              const cfg = BANNER_CONFIG[health.status];
              return (
                <div
                  className={cn(
                    "rounded-sm border px-4 py-2 text-sm font-mono",
                    cfg.border,
                    cfg.bg,
                    cfg.textColor,
                  )}
                >
                  {cfg.text}
                </div>
              );
            })()}

            <div className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground">Services</h2>
              {health.services.map((svc) => (
                <Card key={svc.name} className="border-terminal/10">
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <span className={cn("size-2 rounded-full", HEALTH_DOT_STYLES[svc.status])} />
                      <span className="text-sm font-medium capitalize">{svc.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {svc.latencyMs !== null && (
                        <span className="text-xs font-mono text-muted-foreground">
                          {svc.latencyMs}ms
                        </span>
                      )}
                      <div className="flex items-center gap-1.5">
                        <StatusIcon status={svc.status} />
                        <span
                          className={cn(
                            "text-xs font-mono",
                            svc.status === "healthy" && "text-emerald-500",
                            svc.status === "degraded" && "text-amber-500",
                            svc.status === "unhealthy" && "text-red-500",
                          )}
                        >
                          {STATUS_LABELS[svc.status]}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-terminal/10 pt-4 text-xs font-mono text-muted-foreground">
              <div className="flex items-center gap-4">
                {health.version && <span>v{health.version}</span>}
                <span>uptime {formatUptime(health.uptime)}</span>
              </div>
              <div className="flex items-center gap-2">
                {lastChecked && <span>checked {lastChecked.toLocaleTimeString()}</span>}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2"
                  onClick={load}
                  disabled={refreshing}
                >
                  <RefreshCw className={cn("size-3", refreshing && "animate-spin")} />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
