"use client";

import { motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { CreditOption } from "@/lib/api";
import { createCreditCheckout, getCreditOptions } from "@/lib/api";
import { getBrandConfig } from "@/lib/brand-config";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";
import { isAllowedRedirectUrl } from "@/lib/validate-redirect-url";

const log = logger("billing:buy-credits");

export function BuyCreditsPanel() {
  const [tiers, setTiers] = useState<CreditOption[]>([]);
  const [tiersLoading, setTiersLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTiers = useCallback(() => {
    setTiersLoading(true);
    setLoadError(false);
    getCreditOptions()
      .then((options) => {
        setTiers(options);
        setTiersLoading(false);
      })
      .catch((err) => {
        log.error("Failed to load credit options:", err);
        setLoadError(true);
        setTiersLoading(false);
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setTiersLoading(true);
    setLoadError(false);
    getCreditOptions()
      .then((options) => {
        if (!cancelled) {
          setTiers(options);
          setTiersLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          log.error("Failed to load credit options:", err);
          setLoadError(true);
          setTiersLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCheckout() {
    if (selected === null) return;
    setLoading(true);
    setError(null);
    try {
      const { checkoutUrl } = await createCreditCheckout(selected);
      if (!isAllowedRedirectUrl(checkoutUrl)) {
        setError("Unexpected checkout URL.");
        setLoading(false);
        return;
      }
      window.location.href = checkoutUrl;
    } catch {
      setError("Checkout failed. Please try again.");
      setLoading(false);
    }
  }

  if (tiersLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Buy Credits</CardTitle>
          <p className="text-xs text-muted-foreground">
            {getBrandConfig().dividendsEnabled
              ? "Every purchase resets your 7-day dividend window"
              : "Top up your credit balance"}
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
            {Array.from({ length: 5 }, (_, i) => `tier-sk-${i}`).map((id) => (
              <Skeleton key={id} className="h-16 w-full rounded-md" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loadError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Buy Credits</CardTitle>
          <p className="text-xs text-muted-foreground">
            {getBrandConfig().dividendsEnabled
              ? "Every purchase resets your 7-day dividend window"
              : "Top up your credit balance"}
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-destructive">Failed to load credit packages.</p>
          <Button variant="outline" onClick={loadTiers}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (tiers.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Buy Credits</CardTitle>
          <p className="text-xs text-muted-foreground">
            {getBrandConfig().dividendsEnabled
              ? "Every purchase resets your 7-day dividend window"
              : "Top up your credit balance"}
          </p>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Credit purchases are not available at this time.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Buy Credits</CardTitle>
        <p className="text-xs text-muted-foreground">
          Every purchase resets your 7-day dividend window
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
          {tiers.map((tier) => (
            <motion.button
              key={tier.priceId}
              type="button"
              onClick={() => setSelected(tier.priceId)}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              className={cn(
                "relative flex flex-col items-center gap-1 rounded-md border p-3 text-sm font-medium transition-colors hover:bg-accent",
                selected === tier.priceId
                  ? "border-primary bg-primary/5 ring-1 ring-primary shadow-[0_0_15px_rgba(0,255,65,0.3)]"
                  : "border-border",
              )}
            >
              <span className="text-lg font-bold">{tier.label}</span>
              {tier.bonusPercent > 0 && (
                <Badge className="bg-primary/15 text-primary border-primary/25 text-xs">
                  +{tier.bonusPercent}%
                </Badge>
              )}
            </motion.button>
          ))}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button
          onClick={handleCheckout}
          disabled={selected === null || loading}
          className="w-full sm:w-auto"
        >
          {loading ? "Redirecting..." : "Buy credits"}
        </Button>
      </CardContent>
    </Card>
  );
}
