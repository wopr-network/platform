"use client";

import { AlertTriangleIcon, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { InstanceMetrics } from "@/lib/api";
import { getInstanceMetrics } from "@/lib/api";

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function MetricsDashboard({ instanceId }: { instanceId: string }) {
  const [metrics, setMetrics] = useState<InstanceMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getInstanceMetrics(instanceId);
      setMetrics(data);
    } catch {
      setError("Failed to load metrics — please try again.");
    } finally {
      setLoading(false);
    }
  }, [instanceId]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading && !metrics) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, n) => `sk-${n}`).map((skId) => (
            <div key={skId} className="rounded-sm border p-4 space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-32 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !metrics) {
    return (
      <div className="flex items-center gap-3 rounded-sm border border-destructive/30 bg-destructive/5 px-4 py-3">
        <AlertTriangleIcon className="size-5 shrink-0 text-destructive" />
        <p className="flex-1 text-sm text-destructive">{error ?? "No metrics data available."}</p>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="size-4" />
          Retry
        </Button>
      </div>
    );
  }

  const timeseriesData = metrics.timeseries.map((s) => ({
    ...s,
    time: formatTime(s.timestamp),
  }));

  const tokenData = metrics.tokenUsage.map((t) => ({
    provider: t.provider,
    input: t.inputTokens,
    output: t.outputTokens,
    cost: t.totalCost,
  }));

  const pluginData = metrics.pluginEvents.map((e) => ({
    plugin: e.plugin,
    events: e.count,
  }));

  return (
    <div className="space-y-6">
      {/* Request Count */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Request Count</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={timeseriesData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="time" tick={{ fontSize: 11, fill: "#888" }} />
              <YAxis tick={{ fontSize: 11, fill: "#888" }} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1a1a1a", border: "1px solid #333" }}
                labelStyle={{ color: "#888" }}
              />
              <Line
                type="monotone"
                dataKey="requestCount"
                stroke="var(--terminal)"
                strokeWidth={2}
                dot={false}
                name="Requests"
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Latency Percentiles */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Response Latency (ms)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={timeseriesData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="time" tick={{ fontSize: 11, fill: "#888" }} />
              <YAxis tick={{ fontSize: 11, fill: "#888" }} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1a1a1a", border: "1px solid #333" }}
                labelStyle={{ color: "#888" }}
              />
              <Line
                type="monotone"
                dataKey="latencyP50"
                stroke="var(--terminal)"
                strokeWidth={2}
                dot={false}
                name="p50"
              />
              <Line
                type="monotone"
                dataKey="latencyP95"
                stroke="color-mix(in srgb, var(--terminal) 65%, transparent)"
                strokeWidth={2}
                dot={false}
                name="p95"
              />
              <Line
                type="monotone"
                dataKey="latencyP99"
                stroke="var(--destructive)"
                strokeWidth={2}
                dot={false}
                name="p99"
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Token Usage */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Token Usage by Provider</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={tokenData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="provider" tick={{ fontSize: 11, fill: "#888" }} />
                <YAxis tick={{ fontSize: 11, fill: "#888" }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1a1a1a", border: "1px solid #333" }}
                  labelStyle={{ color: "#888" }}
                />
                <Bar dataKey="input" fill="var(--terminal)" name="Input Tokens" />
                <Bar
                  dataKey="output"
                  fill="color-mix(in srgb, var(--terminal) 45%, transparent)"
                  name="Output Tokens"
                />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-3 space-y-1">
              {metrics.tokenUsage.map((t) => (
                <div
                  key={t.provider}
                  className="flex justify-between text-xs text-muted-foreground"
                >
                  <span className="capitalize">{t.provider}</span>
                  <span className="font-medium text-foreground">${t.totalCost.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Plugin Events */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Plugin Events</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={pluginData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="plugin" tick={{ fontSize: 11, fill: "#888" }} />
                <YAxis tick={{ fontSize: 11, fill: "#888" }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1a1a1a", border: "1px solid #333" }}
                  labelStyle={{ color: "#888" }}
                />
                <Bar dataKey="events" fill="var(--terminal)" name="Events" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Active Sessions */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Active Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={timeseriesData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="time" tick={{ fontSize: 11, fill: "#888" }} />
                <YAxis tick={{ fontSize: 11, fill: "#888" }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1a1a1a", border: "1px solid #333" }}
                  labelStyle={{ color: "#888" }}
                />
                <Line
                  type="monotone"
                  dataKey="activeSessions"
                  stroke="var(--terminal)"
                  strokeWidth={2}
                  dot={false}
                  name="Sessions"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Memory Usage */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Memory Usage (MB)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={timeseriesData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="time" tick={{ fontSize: 11, fill: "#888" }} />
                <YAxis tick={{ fontSize: 11, fill: "#888" }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1a1a1a", border: "1px solid #333" }}
                  labelStyle={{ color: "#888" }}
                />
                <Line
                  type="monotone"
                  dataKey="memoryMb"
                  stroke="var(--terminal)"
                  strokeWidth={2}
                  dot={false}
                  name="Memory"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
