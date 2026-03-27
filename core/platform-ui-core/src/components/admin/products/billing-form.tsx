"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toUserMessage } from "@/lib/errors";

interface BillingConfig {
  stripePublishableKey: string | null;
  creditPrices: Record<string, number>;
  affiliateBaseUrl: string | null;
  affiliateMatchRate: string;
  affiliateMaxCap: number;
  dividendRate: string;
}

interface BillingFormProps {
  initial: BillingConfig;
  onSave: (endpoint: string, data: unknown) => Promise<void>;
}

export function BillingForm({ initial, onSave }: BillingFormProps) {
  const [form, setForm] = useState<BillingConfig>(initial);
  const [saving, setSaving] = useState(false);

  function setStr(key: keyof BillingConfig, value: string) {
    setForm((prev) => ({ ...prev, [key]: value || null }));
  }

  function setRate(key: "affiliateMatchRate" | "dividendRate", value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setNum(key: "affiliateMaxCap", value: string) {
    setForm((prev) => ({ ...prev, [key]: value === "" ? 0 : Number.parseInt(value, 10) }));
  }

  function setCreditPrice(tier: string, value: string) {
    const n = Number.parseFloat(value);
    setForm((prev) => ({
      ...prev,
      creditPrices: { ...prev.creditPrices, [tier]: Number.isNaN(n) ? 0 : n },
    }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave("updateBilling", form);
      toast.success("Billing settings saved.");
    } catch (err) {
      toast.error(toUserMessage(err, "Failed to save billing settings"));
    } finally {
      setSaving(false);
    }
  }

  const creditTiers = Object.keys(form.creditPrices);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Billing Configuration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="billing-stripeKey">Stripe Publishable Key</Label>
          <Input
            id="billing-stripeKey"
            value={form.stripePublishableKey ?? ""}
            onChange={(e) => setStr("stripePublishableKey", e.target.value)}
            placeholder="pk_live_..."
          />
          <p className="text-xs text-muted-foreground">Publishable key only — never the secret.</p>
        </div>

        {creditTiers.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-medium">Credit Price Tiers</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {creditTiers.map((tier) => (
                <div key={tier} className="space-y-1.5">
                  <Label htmlFor={`billing-price-${tier}`} className="capitalize">
                    {tier}
                  </Label>
                  <Input
                    id={`billing-price-${tier}`}
                    type="number"
                    step="0.0001"
                    value={form.creditPrices[tier]}
                    onChange={(e) => setCreditPrice(tier, e.target.value)}
                    min={0}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="border-t border-border pt-4 space-y-4">
          <p className="text-sm font-medium text-muted-foreground">Affiliate &amp; Dividends</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="col-span-full space-y-1.5">
              <Label htmlFor="billing-affiliateUrl">Affiliate Base URL</Label>
              <Input
                id="billing-affiliateUrl"
                value={form.affiliateBaseUrl ?? ""}
                onChange={(e) => setStr("affiliateBaseUrl", e.target.value)}
                placeholder="https://wopr.bot/ref"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="billing-matchRate">Affiliate Match Rate</Label>
              <Input
                id="billing-matchRate"
                value={form.affiliateMatchRate}
                onChange={(e) => setRate("affiliateMatchRate", e.target.value)}
                placeholder="0.10"
              />
              <p className="text-xs text-muted-foreground">Decimal, e.g. 0.10 = 10%</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="billing-maxCap">Affiliate Max Cap (credits)</Label>
              <Input
                id="billing-maxCap"
                type="number"
                value={form.affiliateMaxCap}
                onChange={(e) => setNum("affiliateMaxCap", e.target.value)}
                min={0}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="billing-dividendRate">Dividend Rate</Label>
              <Input
                id="billing-dividendRate"
                value={form.dividendRate}
                onChange={(e) => setRate("dividendRate", e.target.value)}
                placeholder="0.05"
              />
              <p className="text-xs text-muted-foreground">Decimal, e.g. 0.05 = 5%</p>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Billing"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
