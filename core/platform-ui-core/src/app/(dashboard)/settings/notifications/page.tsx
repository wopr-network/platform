"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckIcon, Loader2Icon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import type { NotificationPreferences } from "@/lib/api";
import { brandName } from "@/lib/brand-config";
import { getNotificationPreferences, updateNotificationPreferences } from "@/lib/settings-api";

// ---------------------------------------------------------------------------
// Preference groups
// ---------------------------------------------------------------------------

interface PrefItem {
  key: string & keyof NotificationPreferences;
  label: string;
  description: string;
}

interface PrefGroup {
  title: string;
  items: PrefItem[];
}

const PREF_GROUPS: PrefGroup[] = [
  {
    title: "Billing",
    items: [
      {
        key: "billing_low_balance",
        label: "Low balance alerts",
        description: "Get notified when your credit balance is running low.",
      },
      {
        key: "billing_receipts",
        label: "Purchase receipts",
        description: "Email receipts for credit purchases and crypto payments.",
      },
      {
        key: "billing_auto_topup",
        label: "Auto top-up notifications",
        description: "Notifications when automatic credit top-ups succeed or fail.",
      },
    ],
  },
  {
    title: "Agents",
    items: [
      {
        key: "agent_channel_disconnect",
        label: "Channel disconnections",
        description: "Alert when a connected channel (Discord, Telegram, etc.) goes offline.",
      },
      {
        key: "agent_status_changes",
        label: "Agent status changes",
        description: "Notify on agent creation, suspension, and channel connections.",
      },
    ],
  },
  {
    title: "Account",
    items: [
      {
        key: "account_role_changes",
        label: "Role changes",
        description: "Alert when your account role is changed by an admin.",
      },
      {
        key: "account_team_invites",
        label: "Invitations",
        description: "Receive emails when you are invited to collaborate.",
      },
    ],
  },
  {
    title: "Fleet Updates",
    items: [
      {
        key: "fleet_updates",
        label: "Update availability alerts",
        description: "Get notified when updates are available or applied to your fleet.",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function NotificationsPage() {
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getNotificationPreferences()
      .then(setPrefs)
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);

  const inflightRef = useRef(false);

  const toggle = useCallback(async (key: keyof NotificationPreferences) => {
    if (inflightRef.current) return;
    inflightRef.current = true;

    // Snapshot the value we are about to flip (for revert on error)
    let previousValue: boolean | undefined;

    setPrefs((prev) => {
      if (!prev) return prev;
      previousValue = prev[key];
      return { ...prev, [key]: !prev[key] };
    });

    setSaving(true);
    setSaved(false);

    try {
      const result = await updateNotificationPreferences({ [key]: !previousValue });
      setPrefs(result);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // Revert the specific key using functional updater
      setPrefs((prev) => {
        if (!prev) return prev;
        return { ...prev, [key]: previousValue ?? prev[key] };
      });
    } finally {
      setSaving(false);
      inflightRef.current = false;
    }
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            Control which system emails you receive from {brandName()}.
          </p>
        </div>

        <AnimatePresence>
          {(saving || saved) && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              {saving ? (
                <Loader2Icon className="size-3 animate-spin" />
              ) : (
                <CheckIcon className="size-3 text-green-500" />
              )}
              {saving ? "Saving..." : "Saved"}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {loadError && (
        <p className="text-sm text-destructive">
          Failed to load notification preferences. Please refresh and try again.
        </p>
      )}

      {loading
        ? PREF_GROUPS.map((group) => (
            <Card key={group.title}>
              <CardHeader>
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent className="space-y-4">
                {group.items.map((item) => (
                  <div key={item.key} className="flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <Skeleton className="h-3.5 w-40" />
                      <Skeleton className="h-3 w-64" />
                    </div>
                    <Skeleton className="h-5 w-9 rounded-full" />
                  </div>
                ))}
              </CardContent>
            </Card>
          ))
        : PREF_GROUPS.map((group) => (
            <Card key={group.title}>
              <CardHeader>
                <CardTitle className="text-sm font-medium">{group.title}</CardTitle>
                <CardDescription className="sr-only">
                  {group.title} notification settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {group.items.map((item) => (
                  <div key={item.key} className="flex items-center justify-between gap-4">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium leading-none">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    </div>
                    <Switch
                      checked={prefs?.[item.key] ?? false}
                      onCheckedChange={() => toggle(item.key)}
                      disabled={!prefs || saving}
                      aria-label={item.label}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
    </div>
  );
}
