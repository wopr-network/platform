"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toUserMessage } from "@/lib/errors";
import { trpcVanilla } from "@/lib/trpc";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 15_000;

// ---------------------------------------------------------------------------
// Types (mirrors admin.billingHealth return shape)
// ---------------------------------------------------------------------------

interface PaymentChecks {
  stripeApi: { ok: boolean; latencyMs: number | null; error?: string };
  webhookFreshness: { ok: boolean; lastEventAgeMs: number | null };
  creditLedger: { ok: boolean; negativeBalanceTenants: number };
  meterDlq: { ok: boolean; depth: number };
  gatewayMetrics: { ok: boolean; errorRate: number; creditFailures: number };
  alerts: { ok: boolean; firingCount: number; firingNames: string[] };
}

interface BillingHealthData {
  timestamp: number;
  overall: "healthy" | "degraded" | "outage";
  severity: string | null;
  reasons: string[];
  gateway: {
    last5m: {
      totalRequests: number;
      totalErrors: number;
      errorRate: number;
      byCapability: Record<string, { requests: number; errors: number; errorRate: number }>;
    };
    last60m: { totalRequests: number; totalErrors: number; errorRate: number };
  };
  paymentChecks: PaymentChecks | null;
  alerts: Array<{ name: string; firing: boolean; message: string }>;
  system: {
    cpuLoad1m: number;
    cpuCount: number;
    memoryUsedBytes: number;
    memoryTotalBytes: number;
    diskUsedBytes: number;
    diskTotalBytes: number;
  } | null;
  fleet: { activeBots: number | null };
  business: {
    creditsConsumed24h: number | null;
    activeTenantCount: number | null;
    revenueToday: number | null;
    capabilityBreakdown: Array<{ capability: string; eventCount: number; totalCharge: number }>;
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

type OverallStatus = "healthy" | "degraded" | "outage";

function StatusBadge({ status }: { status: OverallStatus }) {
  const colors: Record<OverallStatus, string> = {
    healthy: "bg-green-500/15 text-green-400 border-green-500/20",
    degraded: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
    outage: "bg-red-500/15 text-red-400 border-red-500/20",
  };
  return (
    <Badge variant="secondary" className={cn("text-sm px-3 py-1 border", colors[status])}>
      {status.toUpperCase()}
    </Badge>
  );
}

function CheckRow({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
      <div className="flex items-center gap-2">
        <div
          className={cn("w-2 h-2 rounded-full flex-shrink-0", ok ? "bg-green-500" : "bg-red-500")}
        />
        <span className="text-sm">{label}</span>
      </div>
      {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
    </div>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs text-muted-foreground font-normal">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  return `${Math.round(bytes / 1_048_576)} MB`;
}

function formatCents(cents: number | null): string {
  if (cents === null) return "N/A";
  return `$${(cents / 100).toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function BillingHealthDashboard() {
  const [data, setData] = useState<BillingHealthData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const result = (await trpcVanilla.admin.billingHealth.query(
          undefined,
        )) as BillingHealthData;
        if (active) {
          setData(result);
          setError(null);
          setLastUpdated(new Date());
        }
      } catch (err) {
        if (active) setError(toUserMessage(err, "Failed to fetch billing health"));
      }
    }

    poll();
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  if (error) {
    return (
      <Card className="border-red-500/20 bg-red-500/5">
        <CardContent className="pt-4">
          <p className="text-sm text-red-400">Error loading billing health: {error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-32" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {(["requests", "error-rate", "bots", "revenue"] as const).map((id) => (
            <Skeleton key={id} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  const capabilityEntries = Object.entries(data.gateway.last5m.byCapability);

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <StatusBadge status={data.overall} />
          {data.severity && (
            <span className="text-sm text-muted-foreground font-medium">{data.severity}</span>
          )}
        </div>
        {lastUpdated && (
          <span className="text-xs text-muted-foreground">
            Updated {lastUpdated.toLocaleTimeString()} · refreshes every 15s
          </span>
        )}
      </div>

      {/* Reason banners */}
      {data.reasons.length > 0 && (
        <Card className="border-red-500/20 bg-red-500/5">
          <CardContent className="pt-4">
            <ul className="space-y-1">
              {data.reasons.map((reason) => (
                <li key={reason} className="text-sm text-red-400">
                  — {reason}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Key metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="Requests (5m)"
          value={String(data.gateway.last5m.totalRequests)}
          sub={`${data.gateway.last5m.totalErrors} errors`}
        />
        <MetricCard
          label="Error Rate (5m)"
          value={`${(data.gateway.last5m.errorRate * 100).toFixed(1)}%`}
          sub={data.gateway.last5m.errorRate > 0.05 ? "above threshold" : "within threshold"}
        />
        <MetricCard
          label="Active Bots"
          value={data.fleet.activeBots !== null ? String(data.fleet.activeBots) : "N/A"}
        />
        <MetricCard
          label="Revenue (24h)"
          value={formatCents(data.business.revenueToday)}
          sub={
            data.business.activeTenantCount !== null
              ? `${data.business.activeTenantCount} active tenants`
              : undefined
          }
        />
      </div>

      {/* Payment health checks */}
      {data.paymentChecks && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Payment Health Checks</CardTitle>
          </CardHeader>
          <CardContent>
            <CheckRow
              ok={data.paymentChecks.stripeApi.ok}
              label="Stripe API"
              detail={
                data.paymentChecks.stripeApi.latencyMs !== null
                  ? `${data.paymentChecks.stripeApi.latencyMs}ms`
                  : data.paymentChecks.stripeApi.error
              }
            />
            <CheckRow
              ok={data.paymentChecks.webhookFreshness.ok}
              label="Webhook Freshness"
              detail={
                data.paymentChecks.webhookFreshness.lastEventAgeMs !== null
                  ? `${Math.round(data.paymentChecks.webhookFreshness.lastEventAgeMs / 60_000)}m ago`
                  : "no events"
              }
            />
            <CheckRow
              ok={data.paymentChecks.creditLedger.ok}
              label="Credit Ledger"
              detail={`${data.paymentChecks.creditLedger.negativeBalanceTenants} negative balances`}
            />
            <CheckRow
              ok={data.paymentChecks.meterDlq.ok}
              label="Meter DLQ"
              detail={`${data.paymentChecks.meterDlq.depth} pending`}
            />
            <CheckRow
              ok={data.paymentChecks.gatewayMetrics.ok}
              label="Gateway Metrics"
              detail={`${(data.paymentChecks.gatewayMetrics.errorRate * 100).toFixed(1)}% errors, ${data.paymentChecks.gatewayMetrics.creditFailures} credit failures`}
            />
            <CheckRow
              ok={data.paymentChecks.alerts.ok}
              label="Alerts"
              detail={
                data.paymentChecks.alerts.firingCount > 0
                  ? data.paymentChecks.alerts.firingNames.join(", ")
                  : "none firing"
              }
            />
          </CardContent>
        </Card>
      )}

      {/* Alert statuses */}
      {data.alerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Alert Status</CardTitle>
          </CardHeader>
          <CardContent>
            {data.alerts.map((alert) => (
              <CheckRow
                key={alert.name}
                ok={!alert.firing}
                label={alert.name}
                detail={alert.message}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* System resources */}
      {data.system && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">System Resources</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-6">
            <div>
              <div className="text-xs text-muted-foreground mb-1">CPU</div>
              <div className="text-lg font-medium">
                {(data.system.cpuCount > 0
                  ? (data.system.cpuLoad1m / data.system.cpuCount) * 100
                  : 0
                ).toFixed(0)}
                %
              </div>
              <div className="text-xs text-muted-foreground">
                Load {data.system.cpuLoad1m.toFixed(2)} / {data.system.cpuCount} cores
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Memory</div>
              <div className="text-lg font-medium">
                {(data.system.memoryTotalBytes > 0
                  ? (data.system.memoryUsedBytes / data.system.memoryTotalBytes) * 100
                  : 0
                ).toFixed(0)}
                %
              </div>
              <div className="text-xs text-muted-foreground">
                {formatBytes(data.system.memoryUsedBytes)} /{" "}
                {formatBytes(data.system.memoryTotalBytes)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Disk</div>
              <div className="text-lg font-medium">
                {(data.system.diskTotalBytes > 0
                  ? (data.system.diskUsedBytes / data.system.diskTotalBytes) * 100
                  : 0
                ).toFixed(0)}
                %
              </div>
              <div className="text-xs text-muted-foreground">
                {formatBytes(data.system.diskUsedBytes)} / {formatBytes(data.system.diskTotalBytes)}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Capability breakdown */}
      {capabilityEntries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Capability Breakdown (5m)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-0">
              {capabilityEntries.map(([cap, stats]) => (
                <div
                  key={cap}
                  className="flex justify-between items-center text-sm py-2 border-b border-border/50 last:border-0"
                >
                  <span className="font-mono text-xs">{cap}</span>
                  <span className="text-muted-foreground">
                    {stats.requests} req · {(stats.errorRate * 100).toFixed(1)}% err
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 60m summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Gateway (60m Window)</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Total Requests</div>
            <div className="text-lg font-medium">{data.gateway.last60m.totalRequests}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Total Errors</div>
            <div className="text-lg font-medium">{data.gateway.last60m.totalErrors}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Error Rate</div>
            <div
              className={cn(
                "text-lg font-medium",
                data.gateway.last60m.errorRate > 0.05 ? "text-red-400" : "text-green-400",
              )}
            >
              {(data.gateway.last60m.errorRate * 100).toFixed(1)}%
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
