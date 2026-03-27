"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import CreateOrgWizard from "@/components/settings/create-org-wizard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { BillingUsage } from "@/lib/api";
import { createBillingPortalSession, getBillingUsage } from "@/lib/api";
import { isAllowedRedirectUrl } from "@/lib/validate-redirect-url";

export default function AccountPage() {
  const [usage, setUsage] = useState<BillingUsage | null>(null);
  const [loading, setLoading] = useState(true);

  const [portalLoading, setPortalLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await getBillingUsage();
      setUsage(data);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleManageBilling() {
    setPortalLoading(true);
    try {
      const { url } = await createBillingPortalSession();
      if (!isAllowedRedirectUrl(url)) {
        toast.error("Unexpected billing portal URL.");
        return;
      }
      window.location.href = url;
    } catch {
      // If portal session fails, fall back to billing page
      window.location.href = "/billing/plans";
    } finally {
      setPortalLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="rounded-sm border p-6 space-y-3">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-48" />
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-9 w-28" />
          </div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-3 text-muted-foreground">
        <p className="text-sm text-destructive">Failed to load account data.</p>
        <Button variant="outline" size="sm" onClick={load}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Account</h1>
        <p className="text-sm text-muted-foreground">Manage your billing settings and team</p>
      </div>

      {/* Current Plan */}
      {usage && (
        <Card>
          <CardHeader>
            <CardTitle>Current Plan</CardTitle>
            <CardDescription>Your active subscription tier</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="text-sm capitalize">
                {usage.planName}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {usage.instancesRunning} of {usage.instanceCap} instances used
              </span>
            </div>
            <Button
              variant="terminal"
              size="sm"
              onClick={handleManageBilling}
              disabled={portalLoading}
            >
              {portalLoading ? "Redirecting..." : "Manage Billing"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Teams & Organizations */}
      <Card>
        <CardHeader>
          <CardTitle>Teams & Organizations</CardTitle>
          <CardDescription>Share bots, billing, and keys across a team.</CardDescription>
        </CardHeader>
        <CardContent>
          <CreateOrgWizard />
        </CardContent>
      </Card>
    </div>
  );
}
