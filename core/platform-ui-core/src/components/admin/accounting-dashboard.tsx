"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { type AdminUserSummary, getUsersList } from "@/lib/admin-api";
import { formatCreditStandard } from "@/lib/format-credit";
import { cn } from "@/lib/utils";

interface AccountingSummary {
  totalUsers: number;
  activeUsers: number;
  suspendedUsers: number;
  bannedUsers: number;
  trialUsers: number;
  totalCreditBalanceCents: number;
  totalAgents: number;
  users: AdminUserSummary[];
  capped: boolean;
}

function MetricCard({
  label,
  value,
  sub,
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs text-muted-foreground font-normal uppercase tracking-wider">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold font-mono">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export function AccountingDashboard() {
  const [summary, setSummary] = useState<AccountingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const result = await getUsersList({ limit: 250 });
      const users = result.users;
      const capped = result.total > 250;
      setSummary({
        totalUsers: result.total,
        activeUsers: users.filter((u) => u.status === "active").length,
        suspendedUsers: users.filter((u) => u.status === "suspended").length,
        bannedUsers: users.filter((u) => u.status === "banned").length,
        trialUsers: users.filter((u) => u.status === "trial").length,
        totalCreditBalanceCents: users.reduce((sum, u) => sum + u.credit_balance_cents, 0),
        totalAgents: users.reduce((sum, u) => sum + u.agent_count, 0),
        users,
        capped,
      });
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-3">
        <p className="text-sm text-destructive font-mono">Failed to load accounting data.</p>
        <Button variant="outline" size="sm" onClick={load}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-xl font-bold uppercase tracking-wider text-terminal [text-shadow:0_0_10px_rgba(0,255,65,0.25)]">
        PLATFORM ACCOUNTING
      </h1>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {["users", "credits", "agents", "status"].map((k) => (
            <Skeleton key={k} className="h-24" />
          ))}
        </div>
      ) : summary ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard
              label="Total Users"
              value={String(summary.totalUsers)}
              sub={`${summary.activeUsers} active, ${summary.suspendedUsers} suspended`}
            />
            <MetricCard
              label="Outstanding Credits"
              value={formatCreditStandard(summary.totalCreditBalanceCents / 100)}
              sub={summary.capped ? "top 250 users only" : "total platform liability"}
            />
            <MetricCard
              label="Total Agents"
              value={String(summary.totalAgents)}
              sub={summary.capped ? "top 250 users only" : "across all tenants"}
            />
            <MetricCard
              label="Status Breakdown"
              value={`${summary.activeUsers} active`}
              sub={[
                summary.suspendedUsers > 0 ? `${summary.suspendedUsers} suspended` : null,
                summary.bannedUsers > 0 ? `${summary.bannedUsers} banned` : null,
                summary.trialUsers > 0 ? `${summary.trialUsers} trial` : null,
                summary.capped ? "(top 250 only)" : null,
              ]
                .filter(Boolean)
                .join(", ")}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm uppercase tracking-wider">
                Top Credit Balances{summary.capped ? " (top 250 users)" : ""}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-0">
                {[...summary.users]
                  .sort((a, b) => b.credit_balance_cents - a.credit_balance_cents)
                  .slice(0, 10)
                  .map((user) => (
                    <div
                      key={user.id}
                      className="flex justify-between items-center text-sm py-2 border-b border-border/50 last:border-0"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs">{user.email}</span>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-medium",
                            user.status === "active"
                              ? "bg-terminal/15 text-terminal border border-terminal/20"
                              : user.status === "suspended"
                                ? "bg-destructive/15 text-red-400 border border-destructive/20"
                                : "bg-secondary text-muted-foreground border border-border",
                          )}
                        >
                          {user.status}
                        </span>
                      </div>
                      <span
                        className={cn(
                          "font-mono text-sm",
                          user.credit_balance_cents === 0
                            ? "text-red-500"
                            : user.credit_balance_cents < 200
                              ? "text-amber-500"
                              : "text-terminal",
                        )}
                      >
                        {formatCreditStandard(user.credit_balance_cents / 100)}
                      </span>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
