"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  getStorageTier,
  getStorageUsage,
  type StorageUsage,
  setStorageTier,
} from "@/lib/bot-settings-data";

const STORAGE_TIERS = [
  {
    key: "standard",
    label: "Standard",
    storageLimitGb: 5,
    dailyCostCents: 0,
    description: "5 GB — included with your bot",
  },
  {
    key: "plus",
    label: "Plus",
    storageLimitGb: 20,
    dailyCostCents: 3,
    description: "20 GB — for bots with browser automation or file processing",
  },
  {
    key: "pro",
    label: "Pro",
    storageLimitGb: 50,
    dailyCostCents: 8,
    description: "50 GB — for semantic memory and large datasets",
  },
  {
    key: "max",
    label: "Max",
    storageLimitGb: 100,
    dailyCostCents: 15,
    description: "100 GB — maximum storage capacity",
  },
] as const;

type TierKey = (typeof STORAGE_TIERS)[number]["key"];

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export function StorageTab({ botId }: { botId: string }) {
  const [currentTier, setCurrentTier] = useState<TierKey>("standard");
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingTier, setPendingTier] = useState<TierKey | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [tierResult, usageResult] = await Promise.all([
          getStorageTier(botId),
          getStorageUsage(botId),
        ]);
        if (!cancelled) {
          setCurrentTier(tierResult.tier as TierKey);
          setUsage(usageResult);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [botId]);

  async function handleConfirmUpgrade() {
    if (!pendingTier) return;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await setStorageTier(botId, pendingTier);
      setCurrentTier(result.tier as TierKey);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setSaveError("Failed to update storage tier — please try again.");
    } finally {
      setSaving(false);
      setPendingTier(null);
    }
  }

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center text-muted-foreground">
        Loading storage info...
      </div>
    );
  }

  const tierInfo = STORAGE_TIERS.find((t) => t.key === currentTier) ?? STORAGE_TIERS[0];
  const limitBytes = tierInfo.storageLimitGb * 1_073_741_824;
  const usedBytes = usage?.usedBytes ?? 0;
  const usagePercent = limitBytes > 0 ? Math.min((usedBytes / limitBytes) * 100, 100) : 0;
  const usageHigh = usagePercent > 80;

  const pendingTierInfo = pendingTier ? STORAGE_TIERS.find((t) => t.key === pendingTier) : null;
  const isDowngrade =
    pendingTier !== null &&
    STORAGE_TIERS.findIndex((t) => t.key === pendingTier) <
      STORAGE_TIERS.findIndex((t) => t.key === currentTier);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-bold">Storage</h2>
        <p className="text-sm text-muted-foreground">
          Persistent storage for bot memories, files, and data.
        </p>
      </div>

      {/* Usage bar */}
      <Card className={usageHigh ? "border-amber-500/25" : ""}>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              {usage ? formatBytes(usedBytes) : "Usage unavailable"} of {tierInfo.storageLimitGb} GB
              used
            </span>
            {usage && (
              <span className={usageHigh ? "text-amber-500" : "text-muted-foreground"}>
                {usagePercent.toFixed(0)}%
              </span>
            )}
          </div>
          <Progress
            value={usage ? usagePercent : 0}
            className={`h-2 ${usageHigh ? "[&>div]:bg-amber-500" : ""}`}
          />
          {!usage && (
            <p className="text-xs text-muted-foreground">
              Disk usage is only available while the bot is running.
            </p>
          )}
        </CardContent>
      </Card>

      {saved && <p className="text-sm text-emerald-500">Storage tier updated!</p>}
      {saveError && <p className="text-sm text-destructive">{saveError}</p>}

      {/* Tier cards */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Storage Tiers
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {STORAGE_TIERS.map((tier) => {
            const isActive = tier.key === currentTier;
            return (
              <Card
                key={tier.key}
                className={`cursor-pointer transition-colors ${
                  isActive
                    ? "border-primary bg-primary/5"
                    : "hover:border-primary/50 hover:bg-accent/30"
                }`}
                onClick={() => {
                  if (!isActive) setPendingTier(tier.key);
                }}
              >
                <CardHeader className="pb-2 pt-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{tier.label}</CardTitle>
                    {isActive && <Badge variant="default">Current</Badge>}
                  </div>
                  <CardDescription>{tier.description}</CardDescription>
                </CardHeader>
                <CardContent className="pb-4">
                  <span className="text-sm font-medium">
                    {tier.dailyCostCents === 0 ? "Included" : `+${tier.dailyCostCents}¢ / day`}
                  </span>
                </CardContent>
              </Card>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Storage costs are billed daily from your credit balance. Downgrades take effect
          immediately but do not delete existing data.
        </p>
      </div>

      {/* Confirmation dialog */}
      <Dialog open={pendingTier !== null} onOpenChange={() => setPendingTier(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isDowngrade ? "Downgrade" : "Upgrade"} to {pendingTierInfo?.label}?
            </DialogTitle>
            <DialogDescription>
              {isDowngrade ? (
                <>
                  Downgrading to <strong>{pendingTierInfo?.label}</strong> (
                  {pendingTierInfo?.storageLimitGb} GB) takes effect immediately. Existing data is
                  not deleted, but the bot will be unable to write new data once it exceeds the new
                  limit.
                </>
              ) : (
                <>
                  Upgrading to <strong>{pendingTierInfo?.label}</strong> (
                  {pendingTierInfo?.storageLimitGb} GB) adds{" "}
                  <strong>{pendingTierInfo?.dailyCostCents}¢ per day</strong> to this bot's credit
                  cost, billed from your balance.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingTier(null)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmUpgrade} disabled={saving}>
              {saving ? "Saving..." : isDowngrade ? "Downgrade" : "Upgrade"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
