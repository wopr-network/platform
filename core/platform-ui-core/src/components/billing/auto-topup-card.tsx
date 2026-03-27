"use client";

import { motion } from "framer-motion";
import { CreditCardIcon, InfoIcon, Loader2Icon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import type { AutoTopupInterval, AutoTopupSettings } from "@/lib/api";
import { getAutoTopupSettings, updateAutoTopupSettings } from "@/lib/api";

const THRESHOLD_OPTIONS = [
  { value: "200", label: "$2" },
  { value: "500", label: "$5" },
  { value: "1000", label: "$10" },
];

const AMOUNT_OPTIONS = [
  { value: "500", label: "$5" },
  { value: "1000", label: "$10" },
  { value: "2000", label: "$20" },
  { value: "5000", label: "$50" },
];

const INTERVAL_OPTIONS: { value: AutoTopupInterval; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

function dividendTip(interval: AutoTopupInterval): string {
  if (interval === "monthly") {
    return "Tip: scheduled top-ups keep you in the dividend pool for 7 days each month.";
  }
  return "Tip: scheduled top-ups keep you in the dividend pool automatically.";
}

function formatNextCharge(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function AutoTopupCard() {
  const [settings, setSettings] = useState<AutoTopupSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAutoTopupSettings();
      setSettings(data);
    } catch {
      setError("Failed to load auto-topup settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save(
    update: Parameters<typeof updateAutoTopupSettings>[0],
    prevSettings: AutoTopupSettings,
  ) {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateAutoTopupSettings(update);
      setSettings(updated);
    } catch {
      setSettings(prevSettings);
      setError("Failed to save settings. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleUsageToggle(enabled: boolean) {
    if (!settings) return;
    const prevSettings = settings;
    const optimistic = {
      ...settings,
      usageBased: { ...settings.usageBased, enabled },
    };
    setSettings(optimistic);
    save(
      {
        usageBased: {
          enabled,
          thresholdCents: settings.usageBased.thresholdCents,
          topupAmountCents: settings.usageBased.topupAmountCents,
        },
      },
      prevSettings,
    );
  }

  function handleUsageThreshold(value: string) {
    if (!settings) return;
    const prevSettings = settings;
    const thresholdCents = Number(value);
    const optimistic = {
      ...settings,
      usageBased: { ...settings.usageBased, thresholdCents },
    };
    setSettings(optimistic);
    save(
      {
        usageBased: {
          enabled: settings.usageBased.enabled,
          thresholdCents,
          topupAmountCents: settings.usageBased.topupAmountCents,
        },
      },
      prevSettings,
    );
  }

  function handleUsageAmount(value: string) {
    if (!settings) return;
    const prevSettings = settings;
    const topupAmountCents = Number(value);
    const optimistic = {
      ...settings,
      usageBased: { ...settings.usageBased, topupAmountCents },
    };
    setSettings(optimistic);
    save(
      {
        usageBased: {
          enabled: settings.usageBased.enabled,
          thresholdCents: settings.usageBased.thresholdCents,
          topupAmountCents,
        },
      },
      prevSettings,
    );
  }

  function handleScheduleToggle(enabled: boolean) {
    if (!settings) return;
    const prevSettings = settings;
    const optimistic = {
      ...settings,
      scheduled: { ...settings.scheduled, enabled },
    };
    setSettings(optimistic);
    save(
      {
        scheduled: {
          enabled,
          amountCents: settings.scheduled.amountCents,
          interval: settings.scheduled.interval,
        },
      },
      prevSettings,
    );
  }

  function handleScheduleAmount(value: string) {
    if (!settings) return;
    const prevSettings = settings;
    const amountCents = Number(value);
    const optimistic = {
      ...settings,
      scheduled: { ...settings.scheduled, amountCents },
    };
    setSettings(optimistic);
    save(
      {
        scheduled: {
          enabled: settings.scheduled.enabled,
          amountCents,
          interval: settings.scheduled.interval,
        },
      },
      prevSettings,
    );
  }

  function handleScheduleInterval(value: string) {
    if (!settings) return;
    const prevSettings = settings;
    const interval = value as AutoTopupInterval;
    const optimistic = {
      ...settings,
      scheduled: { ...settings.scheduled, interval },
    };
    setSettings(optimistic);
    save(
      {
        scheduled: {
          enabled: settings.scheduled.enabled,
          amountCents: settings.scheduled.amountCents,
          interval,
        },
      },
      prevSettings,
    );
  }

  // --- Loading skeleton ---
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            Auto-topup
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-10" />
          </div>
          <Skeleton className="h-4 w-64" />
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-10" />
          </div>
          <Skeleton className="h-4 w-48" />
        </CardContent>
      </Card>
    );
  }

  // --- Error with no data ---
  if (error && !settings) {
    return (
      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            Auto-topup
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-20 flex-col items-center justify-center gap-2 text-muted-foreground">
            <p>{error}</p>
            <Button type="button" variant="link" size="sm" onClick={load} className="h-auto p-0">
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!settings) return null;

  const hasPaymentMethod = settings.paymentMethodLast4 !== null;

  // --- No payment method state ---
  if (!hasPaymentMethod) {
    return (
      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            Auto-topup
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <CreditCardIcon className="size-4 shrink-0" />
            <p>Add a payment method to enable auto-topup.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // --- Main UI ---
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle role="heading" aria-level={2}>
              Auto-topup
            </CardTitle>
            {saving && <Loader2Icon className="size-4 animate-spin text-muted-foreground" />}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* --- Usage-based section --- */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="usage-toggle" className="text-sm font-medium">
                Usage-based
              </Label>
              <Switch
                id="usage-toggle"
                checked={settings.usageBased.enabled}
                onCheckedChange={handleUsageToggle}
                disabled={saving}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>When balance drops below</span>
              <Select
                value={String(settings.usageBased.thresholdCents)}
                onValueChange={handleUsageThreshold}
                disabled={saving || !settings.usageBased.enabled}
              >
                <SelectTrigger size="sm" className="w-[72px]" aria-label="Threshold amount">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {THRESHOLD_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span>add</span>
              <Select
                value={String(settings.usageBased.topupAmountCents)}
                onValueChange={handleUsageAmount}
                disabled={saving || !settings.usageBased.enabled}
              >
                <SelectTrigger size="sm" className="w-[72px]" aria-label="Top-up amount">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AMOUNT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* --- Scheduled section --- */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="schedule-toggle" className="text-sm font-medium">
                Scheduled
              </Label>
              <Switch
                id="schedule-toggle"
                checked={settings.scheduled.enabled}
                onCheckedChange={handleScheduleToggle}
                disabled={saving}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>Add</span>
              <Select
                value={String(settings.scheduled.amountCents)}
                onValueChange={handleScheduleAmount}
                disabled={saving || !settings.scheduled.enabled}
              >
                <SelectTrigger size="sm" className="w-[72px]" aria-label="Scheduled amount">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AMOUNT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span>every</span>
              <Select
                value={settings.scheduled.interval}
                onValueChange={handleScheduleInterval}
                disabled={saving || !settings.scheduled.enabled}
              >
                <SelectTrigger size="sm" className="w-[100px]" aria-label="Schedule interval">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTERVAL_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {settings.scheduled.enabled && settings.scheduled.nextChargeDate && (
              <p className="text-xs text-muted-foreground">
                Next charge: {formatNextCharge(settings.scheduled.nextChargeDate)}
              </p>
            )}
          </div>

          {/* --- Footer: card on file + tip --- */}
          <div className="space-y-2 border-t pt-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CreditCardIcon className="size-3.5" />
              <span>
                Charged to {settings.paymentMethodBrand} .... {settings.paymentMethodLast4}
              </span>
            </div>
            {settings.scheduled.enabled && (
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
                <span>{dividendTip(settings.scheduled.interval)}</span>
              </div>
            )}
          </div>

          {/* --- Inline error --- */}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </motion.div>
  );
}
