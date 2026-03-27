"use client";

import { AlertTriangleIcon, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { HealthStatus, InstanceHealth } from "@/lib/api";
import { getInstanceHealth } from "@/lib/api";
import { cn } from "@/lib/utils";

const healthColors: Record<HealthStatus, { bg: string; text: string; dot: string }> = {
  healthy: {
    bg: "bg-emerald-500/15 border-emerald-500/25",
    text: "text-emerald-500",
    dot: "bg-emerald-500",
  },
  degraded: {
    bg: "bg-yellow-500/15 border-yellow-500/25",
    text: "text-yellow-500",
    dot: "bg-yellow-500",
  },
  unhealthy: {
    bg: "bg-red-500/15 border-red-500/25",
    text: "text-red-500",
    dot: "bg-red-500",
  },
};

function HealthBadge({ status }: { status: HealthStatus }) {
  const c = healthColors[status];
  return (
    <Badge variant="outline" className={cn("gap-1.5 capitalize", c.bg, c.text)}>
      <span className={cn("size-1.5 rounded-full", c.dot)} />
      {status}
    </Badge>
  );
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function HealthOverview({ instanceId }: { instanceId: string }) {
  const [health, setHealth] = useState<InstanceHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getInstanceHealth(instanceId);
      setHealth(data);
    } catch {
      setError("Failed to load health data — please try again.");
    } finally {
      setLoading(false);
    }
  }, [instanceId]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading && !health) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-5 w-32" />
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, n) => `sk-${n}`).map((skId) => (
            <div key={skId} className="rounded-sm border p-4 space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-6 w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !health) {
    return (
      <div className="flex items-center gap-3 rounded-sm border border-destructive/30 bg-destructive/5 px-4 py-3">
        <AlertTriangleIcon className="size-5 shrink-0 text-destructive" />
        <p className="flex-1 text-sm text-destructive">{error ?? "No health data available."}</p>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="size-4" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status + Uptime */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Health Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <HealthBadge status={health.status} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Uptime</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">{formatUptime(health.uptime)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Active Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">
              {health.activeSessions}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                / {health.totalSessions} total
              </span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Plugins</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">{health.plugins.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Plugin Health Grid */}
      <div>
        <h3 className="mb-3 text-sm font-medium">Plugin Health</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {health.plugins.map((plugin) => {
            const c = healthColors[plugin.status];
            return (
              <Card key={plugin.name} className={cn("border", c.bg)}>
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium">{plugin.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {plugin.latencyMs !== null ? `${plugin.latencyMs}ms` : "N/A"}
                    </p>
                  </div>
                  <HealthBadge status={plugin.status} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Provider Availability */}
      <div>
        <h3 className="mb-3 text-sm font-medium">Provider Availability</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {health.providers.map((provider) => (
            <Card
              key={provider.name}
              className={cn(
                "border",
                provider.available
                  ? "bg-emerald-500/5 border-emerald-500/25"
                  : "bg-red-500/5 border-red-500/25",
              )}
            >
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium capitalize">{provider.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {provider.latencyMs !== null ? `${provider.latencyMs}ms` : "Unavailable"}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    provider.available
                      ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/25"
                      : "bg-red-500/15 text-red-500 border-red-500/25",
                  )}
                >
                  {provider.available ? "Available" : "Down"}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Health History Timeline */}
      <div>
        <h3 className="mb-3 text-sm font-medium">Health History</h3>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-end gap-1">
              {health.history.map((entry, i) => {
                const c = healthColors[entry.status];
                return (
                  <div
                    key={`${entry.timestamp}-${i}`}
                    className={cn("h-8 flex-1 rounded-sm", c.dot)}
                    title={`${new Date(entry.timestamp).toLocaleTimeString()} - ${entry.status}`}
                  />
                );
              })}
            </div>
            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
              <span>
                {health.history.length > 0
                  ? new Date(health.history[0].timestamp).toLocaleTimeString()
                  : ""}
              </span>
              <span>
                {health.history.length > 0
                  ? new Date(
                      health.history[health.history.length - 1].timestamp,
                    ).toLocaleTimeString()
                  : ""}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
