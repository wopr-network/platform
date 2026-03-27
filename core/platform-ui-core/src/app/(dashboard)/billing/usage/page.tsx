"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ByokCallout } from "@/components/billing/byok-callout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CreditDetailed } from "@/components/ui/credit-detailed";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import type {
  BillingUsage,
  BillingUsageSummary,
  HostedCapability,
  HostedUsageSummary,
  InferenceMode,
  ProviderCost,
  SpendingLimits,
  UsageDataPoint,
} from "@/lib/api";
import {
  getBillingUsage,
  getBillingUsageSummary,
  getHostedUsageSummary,
  getInferenceMode,
  getProviderCosts,
  getSpendingLimits,
  getUsageHistory,
  updateSpendingLimits,
} from "@/lib/api";
import { brandName } from "@/lib/brand-config";
import { formatCreditStandard } from "@/lib/format-credit";
import { cn } from "@/lib/utils";

const CAPABILITY_LABELS: Record<HostedCapability, string> = {
  transcription: "Transcription",
  image_gen: "Image Generation",
  text_gen: "Text Generation",
  embeddings: "Embeddings",
};

export default function UsagePage() {
  const [usage, setUsage] = useState<BillingUsage | null>(null);
  const [providerCosts, setProviderCosts] = useState<ProviderCost[]>([]);
  const [history, setHistory] = useState<UsageDataPoint[]>([]);
  const [hostedUsage, setHostedUsage] = useState<HostedUsageSummary | null>(null);
  const [inferenceMode, setInferenceMode] = useState<InferenceMode | null>(null);
  const [spendingLimits, setSpendingLimits] = useState<SpendingLimits | null>(null);
  const [summary, setSummary] = useState<BillingUsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCostTracker, setShowCostTracker] = useState(false);
  const [showSpendingControls, setShowSpendingControls] = useState(false);
  const [savingLimits, setSavingLimits] = useState(false);
  const [limitsMsg, setLimitsMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const mode = await getInferenceMode().catch(() => "byok" as const);
      setInferenceMode(mode);

      const [usageData, costsData, historyData, summaryData] = await Promise.all([
        getBillingUsage(),
        getProviderCosts(),
        getUsageHistory(30),
        getBillingUsageSummary().catch(() => null),
      ]);
      setUsage(usageData);
      setProviderCosts(costsData);
      setHistory(historyData);
      setSummary(summaryData);

      if (mode === "hosted") {
        const [hosted, limits] = await Promise.all([
          getHostedUsageSummary().catch(() => null),
          getSpendingLimits().catch(() => null),
        ]);
        setHostedUsage(hosted);
        setSpendingLimits(limits);
      }
    } catch {
      setError("Failed to load usage data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSaveLimits() {
    if (!spendingLimits) return;
    setSavingLimits(true);
    setLimitsMsg(null);
    try {
      await updateSpendingLimits(spendingLimits);
      setLimitsMsg("Spending limits saved.");
    } catch {
      setLimitsMsg("Failed to save spending limits.");
    } finally {
      setSavingLimits(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="rounded-sm border p-6 space-y-4">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-44" />
          <Skeleton className="h-8 w-24" />
          <Separator className="my-4" />
          {Array.from({ length: 3 }, (_, n) => `sk-sum-${n}`).map((skId) => (
            <div key={skId} className="flex justify-between">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3.5 w-16" />
            </div>
          ))}
        </div>
        <div className="rounded-sm border p-6 space-y-4">
          <Skeleton className="h-5 w-32" />
          {Array.from({ length: 3 }, (_, n) => `sk-${n}`).map((skId) => (
            <div key={skId} className="space-y-1.5">
              <div className="flex justify-between">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-24" />
              </div>
              <Skeleton className="h-2 w-full" />
            </div>
          ))}
        </div>
        <div className="rounded-sm border p-6 space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (error || !usage) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-3 text-muted-foreground">
        <p className="text-sm text-destructive">{error ?? "Unable to load usage data."}</p>
        <Button variant="outline" size="sm" onClick={load}>
          Retry
        </Button>
      </div>
    );
  }

  const periodStart = new Date(usage.billingPeriodStart).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const periodEnd = new Date(usage.billingPeriodEnd).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const totalEstimatedCost = providerCosts.reduce((sum, c) => sum + c.estimatedCost, 0);
  const isHosted = inferenceMode === "hosted";

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Usage</h1>
        <p className="text-sm text-muted-foreground">
          Billing period: {periodStart} - {periodEnd} ({usage.planName} plan)
        </p>
      </div>

      <ByokCallout compact />

      {/* Billing Summary */}
      {summary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Billing Summary
            </CardTitle>
            <CardDescription>
              {summary.planName} plan &mdash;{" "}
              {new Date(summary.periodStart).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}{" "}
              -{" "}
              {new Date(summary.periodEnd).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-3">
              <span
                className={cn(
                  "text-3xl font-bold tabular-nums transition-colors duration-200",
                  summary.amountDue === 0 ? "text-terminal" : "text-foreground",
                )}
              >
                {formatCreditStandard(summary.amountDue)}
              </span>
              <span className="text-sm text-muted-foreground">amount due</span>
            </div>
            <Separator className="my-4" />
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total spend this period</span>
                <span className="font-medium tabular-nums">
                  {formatCreditStandard(summary.totalSpend)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Included credit</span>
                <span className="font-medium tabular-nums text-terminal-dim">
                  -{formatCreditStandard(summary.includedCredit)}
                </span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Amount due</span>
                <span className="tabular-nums">{formatCreditStandard(summary.amountDue)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Platform Usage Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Platform Usage</CardTitle>
          <CardDescription>
            Your {brandName()} orchestration usage this billing period
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <UsageMeter
            label="Instances"
            current={usage.instancesRunning}
            cap={usage.instanceCap}
            unit=""
          />
          <UsageMeter
            label="Storage"
            current={usage.storageUsedGb}
            cap={usage.storageCapGb}
            unit="GB"
            decimals={1}
          />
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">API calls</span>
              <span className="font-medium">{usage.apiCalls.toLocaleString()} this month</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Hosted AI Usage (hosted users only) */}
      {isHosted && hostedUsage && (
        <Card>
          <CardHeader>
            <CardTitle>Hosted AI Usage</CardTitle>
            <CardDescription>Per-capability breakdown for this billing period</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {hostedUsage.capabilities.length > 0 && (
              <div className="w-full">
                <ResponsiveContainer
                  width="100%"
                  height={hostedUsage.capabilities.length * 40 + 20}
                >
                  <BarChart
                    data={hostedUsage.capabilities.map((cap) => ({
                      label: CAPABILITY_LABELS[cap.capability] ?? cap.label,
                      cost: cap.cost,
                    }))}
                    layout="vertical"
                    margin={{ left: 0, right: 12, top: 0, bottom: 0 }}
                  >
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      tickFormatter={(v: number) => `$${v}`}
                    />
                    <YAxis
                      dataKey="label"
                      type="category"
                      width={120}
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius)",
                        fontFamily: "JetBrains Mono",
                        fontSize: 12,
                      }}
                      labelStyle={{ color: "var(--foreground)" }}
                      itemStyle={{ color: "var(--muted-foreground)" }}
                      formatter={(value) => [formatCreditStandard(Number(value)), "Cost"]}
                    />
                    <Bar dataKey="cost" fill="var(--terminal)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="space-y-2">
              {hostedUsage.capabilities.map((cap) => (
                <div key={cap.capability} className="flex items-center justify-between text-sm">
                  <span className="font-medium">
                    {CAPABILITY_LABELS[cap.capability] ?? cap.label}
                  </span>
                  <div className="flex items-center gap-4 text-muted-foreground">
                    <span>
                      {cap.units.toLocaleString()} {cap.unitLabel}
                    </span>
                    <span className="w-16 text-right font-medium text-foreground min-w-[7rem]">
                      <CreditDetailed value={cap.cost} />
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <Separator />
            <div className="space-y-1 text-sm">
              <div className="flex justify-between font-medium">
                <span>Total this period</span>
                <span>{formatCreditStandard(hostedUsage.totalCost)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Included in plan</span>
                <span>-{formatCreditStandard(hostedUsage.includedCredit)}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Amount due</span>
                <span>{formatCreditStandard(hostedUsage.amountDue)}</span>
              </div>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/billing/usage/hosted">View detailed breakdown</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* BYOK Cost Tracker (opt-in, BYOK users) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle>BYOK Cost Tracker</CardTitle>
              <CardDescription>
                Estimated spend with your AI providers (approximate, based on token counts)
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="cost-tracker-toggle" className="text-sm text-muted-foreground">
                {showCostTracker ? "On" : "Off"}
              </Label>
              <Switch
                id="cost-tracker-toggle"
                checked={showCostTracker}
                onCheckedChange={setShowCostTracker}
              />
            </div>
          </div>
        </CardHeader>
        {showCostTracker && (
          <CardContent className="space-y-4">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">{formatCreditStandard(totalEstimatedCost)}</span>
              <span className="text-sm text-muted-foreground">estimated this period</span>
            </div>
            <div className="space-y-2">
              {providerCosts.map((cost) => (
                <div key={cost.provider} className="flex items-center justify-between text-sm">
                  <span className="font-medium">{cost.provider}</span>
                  <div className="flex items-center gap-4 text-muted-foreground">
                    <span>
                      {(cost.inputTokens / 1000).toFixed(0)}k in /{" "}
                      {(cost.outputTokens / 1000).toFixed(0)}k out
                    </span>
                    <span className="font-medium text-foreground min-w-[7rem]">
                      ~<CreditDetailed value={cost.estimatedCost} />
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              These are your direct costs with your providers — {brandName()} does not charge for
              inference.
            </p>
          </CardContent>
        )}
      </Card>

      {/* Spending Controls (hosted users only) */}
      {isHosted && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <CardTitle>Spending Controls</CardTitle>
                <CardDescription>
                  Set alerts and hard caps to manage your hosted AI spend
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="spending-controls-toggle" className="text-sm text-muted-foreground">
                  {showSpendingControls ? "On" : "Off"}
                </Label>
                <Switch
                  id="spending-controls-toggle"
                  checked={showSpendingControls}
                  onCheckedChange={setShowSpendingControls}
                />
              </div>
            </div>
          </CardHeader>
          {showSpendingControls && spendingLimits && (
            <CardContent className="space-y-6">
              {/* Global limits */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold">Global Limits</h4>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="global-alert" className="text-xs">
                      Alert at ($/month)
                    </Label>
                    <Input
                      id="global-alert"
                      type="number"
                      min={0}
                      step={1}
                      placeholder="No alert"
                      value={spendingLimits.global.alertAt ?? ""}
                      onChange={(e) =>
                        setSpendingLimits({
                          ...spendingLimits,
                          global: {
                            ...spendingLimits.global,
                            alertAt: e.target.value ? Number(e.target.value) : null,
                          },
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="global-cap" className="text-xs">
                      Hard cap ($/month)
                    </Label>
                    <Input
                      id="global-cap"
                      type="number"
                      min={0}
                      step={1}
                      placeholder="No cap"
                      value={spendingLimits.global.hardCap ?? ""}
                      onChange={(e) =>
                        setSpendingLimits({
                          ...spendingLimits,
                          global: {
                            ...spendingLimits.global,
                            hardCap: e.target.value ? Number(e.target.value) : null,
                          },
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Per-capability limits */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold">Per-Capability Limits</h4>
                {(Object.entries(CAPABILITY_LABELS) as [HostedCapability, string][]).map(
                  ([cap, label]) => (
                    <div key={cap} className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">{label}</p>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          placeholder="Alert at $/mo"
                          aria-label={`${label} alert limit`}
                          value={spendingLimits.perCapability[cap]?.alertAt ?? ""}
                          onChange={(e) => {
                            const existing = spendingLimits.perCapability[cap] ?? {
                              alertAt: null,
                              hardCap: null,
                            };
                            setSpendingLimits({
                              ...spendingLimits,
                              perCapability: {
                                ...spendingLimits.perCapability,
                                [cap]: {
                                  ...existing,
                                  alertAt: e.target.value ? Number(e.target.value) : null,
                                },
                              },
                            });
                          }}
                        />
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          placeholder="Hard cap $/mo"
                          aria-label={`${label} hard cap`}
                          value={spendingLimits.perCapability[cap]?.hardCap ?? ""}
                          onChange={(e) => {
                            const existing = spendingLimits.perCapability[cap] ?? {
                              alertAt: null,
                              hardCap: null,
                            };
                            setSpendingLimits({
                              ...spendingLimits,
                              perCapability: {
                                ...spendingLimits.perCapability,
                                [cap]: {
                                  ...existing,
                                  hardCap: e.target.value ? Number(e.target.value) : null,
                                },
                              },
                            });
                          }}
                        />
                      </div>
                    </div>
                  ),
                )}
              </div>

              {limitsMsg && <p className="text-sm text-muted-foreground">{limitsMsg}</p>}
              <Button onClick={handleSaveLimits} disabled={savingLimits}>
                {savingLimits ? "Saving..." : "Save limits"}
              </Button>
            </CardContent>
          )}
        </Card>
      )}

      {/* Usage Over Time */}
      <Card>
        <CardHeader>
          <CardTitle>Usage Over Time</CardTitle>
          <CardDescription>Daily API calls over the last 30 days</CardDescription>
        </CardHeader>
        <CardContent>
          <UsageChart data={history} />
        </CardContent>
      </Card>
    </div>
  );
}

function UsageMeter({
  label,
  current,
  cap,
  unit,
  decimals = 0,
}: {
  label: string;
  current: number;
  cap: number;
  unit: string;
  decimals?: number;
}) {
  const pct = cap === 0 ? (current > 0 ? 100 : 0) : Math.min((current / cap) * 100, 100);
  const formatted = decimals > 0 ? current.toFixed(decimals) : String(current);
  const capFormatted = decimals > 0 ? cap.toFixed(decimals) : String(cap);

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">
          {formatted} of {capFormatted}
          {unit ? ` ${unit}` : ""}
        </span>
      </div>
      <Progress
        value={pct}
        className={cn(
          pct > 90 && "[&>[data-slot=progress-indicator]]:bg-destructive",
          pct > 70 && pct <= 90 && "[&>[data-slot=progress-indicator]]:bg-amber-500",
        )}
      />
    </div>
  );
}

function UsageChart({ data }: { data: UsageDataPoint[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No usage data available.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="terminalGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--terminal)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="var(--terminal)" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
        <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
        <Tooltip
          contentStyle={{
            backgroundColor: "var(--card)",
            border: "1px solid color-mix(in srgb, var(--terminal) 20%, transparent)",
            borderRadius: "var(--radius)",
            fontFamily: "JetBrains Mono",
            fontSize: 12,
          }}
          labelStyle={{ color: "var(--foreground)" }}
          itemStyle={{ color: "var(--muted-foreground)" }}
        />
        <Area
          type="monotone"
          dataKey="apiCalls"
          stroke="var(--terminal)"
          fill="url(#terminalGradient)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
