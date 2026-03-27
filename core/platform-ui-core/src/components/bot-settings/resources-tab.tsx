"use client";

import { useEffect, useRef, useState } from "react";
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
import { getResourceTier, setResourceTier } from "@/lib/bot-settings-data";
import { toUserMessage } from "@/lib/errors";

const TIERS = [
  {
    key: "standard",
    label: "Standard",
    ram: "2 GB",
    cpu: "2 vCPU",
    dailyCost: 0,
    monthlyCost: "Included",
    description: "Included with your bot",
  },
  {
    key: "pro",
    label: "Pro",
    ram: "4 GB",
    cpu: "4 vCPU",
    dailyCost: 10,
    monthlyCost: "~$3/mo",
    description: "For heavier workloads",
  },
  {
    key: "power",
    label: "Power",
    ram: "8 GB",
    cpu: "6 vCPU",
    dailyCost: 27,
    monthlyCost: "~$8/mo",
    description: "For power users",
  },
  {
    key: "beast",
    label: "Beast",
    ram: "16 GB",
    cpu: "8 vCPU",
    dailyCost: 50,
    monthlyCost: "~$15/mo",
    description: "Maximum performance",
  },
] as const;

type TierEntry = (typeof TIERS)[number];

export function ResourcesTab({ botId }: { botId: string }) {
  const [currentTier, setCurrentTier] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmTier, setConfirmTier] = useState<TierEntry | null>(null);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // biome-ignore lint/suspicious/noEmptyBlockStatements: initial no-op placeholder replaced in useEffect
  const retryRef = useRef<() => void>(() => {});

  useEffect(() => {
    let cancelled = false;
    function loadTier() {
      setLoading(true);
      setLoadError(null);
      getResourceTier(botId)
        .then((res) => {
          if (!cancelled) setCurrentTier(res.tier);
        })
        .catch((_err) => {
          if (!cancelled) {
            setCurrentTier(null);
            setLoadError("Failed to load resource tier. Please refresh.");
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }
    retryRef.current = loadTier;
    loadTier();
    return () => {
      cancelled = true;
    };
  }, [botId]);

  async function handleConfirm() {
    if (!confirmTier) return;
    setApplying(true);
    setError(null);
    try {
      const result = await setResourceTier(botId, confirmTier.key);
      setCurrentTier(result.tier);
      setConfirmTier(null);
    } catch (err) {
      setError(toUserMessage(err, "Failed to change tier"));
    } finally {
      setApplying(false);
    }
  }

  if (loading) {
    return <div className="text-muted-foreground">Loading resource info...</div>;
  }

  if (loadError) {
    return (
      <div className="flex items-center gap-2 text-sm text-destructive">
        <span>{loadError}</span>
        <Button size="sm" variant="outline" onClick={() => retryRef.current()}>
          Retry
        </Button>
      </div>
    );
  }

  const currentTierIndex = TIERS.findIndex((t) => t.key === currentTier);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-xl font-bold">Resources</h2>
        <p className="text-sm text-muted-foreground">
          Upgrade your bot's RAM and CPU. Higher tiers cost additional daily credits.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {TIERS.map((tier) => {
          const isCurrent = tier.key === currentTier;
          const tierIndex = TIERS.findIndex((t) => t.key === tier.key);
          return (
            <Card key={tier.key} className={isCurrent ? "border-primary ring-1 ring-primary" : ""}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{tier.label}</CardTitle>
                  {isCurrent && <Badge>Current</Badge>}
                </div>
                <CardDescription>{tier.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-4 text-sm">
                  <span>{tier.ram} RAM</span>
                  <span>{tier.cpu}</span>
                </div>
                <div className="text-sm font-medium">
                  {tier.dailyCost === 0
                    ? "Included"
                    : `+${tier.dailyCost} credits/day (${tier.monthlyCost})`}
                </div>
                {!isCurrent && (
                  <Button
                    size="sm"
                    variant={tier.key === "standard" ? "outline" : "default"}
                    onClick={() => setConfirmTier(tier)}
                  >
                    {currentTier === null
                      ? "Select"
                      : tierIndex < currentTierIndex
                        ? "Downgrade"
                        : "Upgrade"}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Dialog open={confirmTier !== null} onOpenChange={() => setConfirmTier(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change to {confirmTier?.label}?</DialogTitle>
            <DialogDescription>
              {confirmTier && confirmTier.dailyCost > 0
                ? `This will add ${confirmTier.dailyCost} credits/day (${confirmTier.monthlyCost}) to your bot's running cost. Your bot will restart to apply new resource limits.`
                : "Your bot will restart to apply new resource limits. No additional cost."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmTier(null)}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={applying}>
              {applying ? "Applying..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
