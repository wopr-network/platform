"use client";

import { Server } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { upgradeToVps } from "@/lib/api";
import { isAllowedRedirectUrl } from "@/lib/validate-redirect-url";

interface VpsUpgradeCardProps {
  botId: string;
}

export function VpsUpgradeCard({ botId }: VpsUpgradeCardProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpgrade() {
    setLoading(true);
    setError(null);
    try {
      const res = await upgradeToVps(
        botId,
        `${window.location.origin}/instances/${botId}?vps=activated`,
        window.location.href,
      );

      if (res.status === 409) {
        setError("This bot is already on the VPS tier.");
        return;
      }

      if (res.status === 402) {
        setError("No payment method on file. Please add one in billing settings.");
        return;
      }

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Failed to start upgrade.");
        return;
      }

      const data = (await res.json()) as { url: string };
      if (data.url) {
        if (!isAllowedRedirectUrl(data.url)) {
          setError("Unexpected checkout URL. Please contact support.");
          return;
        }
        window.location.href = data.url;
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-terminal/50 bg-terminal/5">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Server className="size-5 text-terminal" />
          <CardTitle className="text-lg">Upgrade to VPS</CardTitle>
          <Badge variant="terminal" className="ml-auto text-xs">
            $15/mo
          </Badge>
        </div>
        <CardDescription>
          Get a dedicated persistent container with fixed monthly pricing — no per-credit billing
          for compute.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="grid grid-cols-1 gap-1 text-sm text-muted-foreground sm:grid-cols-2">
          <li className="flex items-center gap-2">
            <span className="text-terminal">✓</span> 2 GB RAM / 2 vCPU
          </li>
          <li className="flex items-center gap-2">
            <span className="text-terminal">✓</span> 20 GB SSD
          </li>
          <li className="flex items-center gap-2">
            <span className="text-terminal">✓</span> Persistent container
          </li>
          <li className="flex items-center gap-2">
            <span className="text-terminal">✓</span> Dedicated hostname
          </li>
          <li className="flex items-center gap-2">
            <span className="text-terminal">✓</span> SSH access
          </li>
          <li className="flex items-center gap-2">
            <span className="text-terminal">✓</span> Flat monthly price
          </li>
        </ul>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <p className="text-xs text-muted-foreground">
          Your bot will experience brief downtime during the container upgrade. You will be
          redirected to Stripe Checkout to complete the subscription.
        </p>

        <Button onClick={handleUpgrade} disabled={loading} className="w-full sm:w-auto">
          {loading ? "Redirecting to checkout..." : "Upgrade to VPS — $15/mo"}
        </Button>
      </CardContent>
    </Card>
  );
}
