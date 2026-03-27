"use client";

import { Clock, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useTenant } from "@/lib/tenant-context";
import { trpc } from "@/lib/trpc";

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => {
  const label =
    i === 0 ? "12:00 AM" : i < 12 ? `${i}:00 AM` : i === 12 ? "12:00 PM" : `${i - 12}:00 PM`;
  return { value: String(i), label };
});

export function UpdateSettingsCard() {
  const { activeTenantId: tenantId } = useTenant();
  const [saving, setSaving] = useState(false);

  const configQuery = trpc.fleetUpdateConfig.getUpdateConfig.useQuery(
    { tenantId },
    { enabled: !!tenantId },
  );

  const setConfigMutation = trpc.fleetUpdateConfig.setUpdateConfig.useMutation();

  const mode = configQuery.data?.mode ?? "auto";
  const preferredHourUtc = configQuery.data?.preferredHourUtc ?? 3;

  async function handleModeToggle(checked: boolean) {
    const newMode = checked ? "auto" : "manual";
    setSaving(true);
    try {
      await setConfigMutation.mutateAsync({
        tenantId,
        mode: newMode,
        preferredHourUtc,
      });
      await configQuery.refetch();
      toast.success(`Updates set to ${newMode}`);
    } catch {
      toast.error("Failed to update settings");
    } finally {
      setSaving(false);
    }
  }

  async function handleHourChange(value: string) {
    const hour = Number.parseInt(value, 10);
    setSaving(true);
    try {
      await setConfigMutation.mutateAsync({
        tenantId,
        mode,
        preferredHourUtc: hour,
      });
      await configQuery.refetch();
      toast.success("Preferred update window saved");
    } catch {
      toast.error("Failed to update settings");
    } finally {
      setSaving(false);
    }
  }

  if (!tenantId) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5 text-muted-foreground" />
          Auto-Update Settings
        </CardTitle>
        <CardDescription>
          Control how your fleet receives updates. Auto mode applies updates during your preferred
          maintenance window. Manual mode shows an update badge — you choose when to apply.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {configQuery.isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading settings...
          </div>
        ) : configQuery.isError ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            Failed to load update settings. Please try again later.
          </div>
        ) : (
          <>
            {/* Auto/Manual toggle */}
            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="auto-update-toggle" className="text-base font-medium">
                  Automatic Updates
                </Label>
                <p className="text-sm text-muted-foreground">
                  {mode === "auto"
                    ? "Instances update automatically during the maintenance window"
                    : "You'll be notified when updates are available"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                <Switch
                  id="auto-update-toggle"
                  checked={mode === "auto"}
                  onCheckedChange={handleModeToggle}
                  disabled={saving}
                />
              </div>
            </div>

            {/* Preferred hour picker — only shown in auto mode */}
            {mode === "auto" && (
              <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div className="space-y-0.5">
                  <Label className="flex items-center gap-2 text-base font-medium">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    Maintenance Window
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Preferred hour for applying updates (UTC)
                  </p>
                </div>
                <Select
                  value={String(preferredHourUtc)}
                  onValueChange={handleHourChange}
                  disabled={saving}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HOUR_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Current status */}
            {configQuery.data?.updatedAt && (
              <p className="text-xs text-muted-foreground">
                Last changed:{" "}
                {new Date(configQuery.data.updatedAt).toLocaleString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
