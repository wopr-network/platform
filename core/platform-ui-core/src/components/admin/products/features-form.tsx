"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toUserMessage } from "@/lib/errors";

interface FeaturesConfig {
  chatEnabled: boolean;
  onboardingEnabled: boolean;
  onboardingDefaultModel: string | null;
  onboardingMaxCredits: number;
  onboardingWelcomeMsg: string | null;
  sharedModuleBilling: boolean;
  sharedModuleMonitoring: boolean;
  sharedModuleAnalytics: boolean;
}

interface FeaturesFormProps {
  initial: FeaturesConfig;
  onSave: (endpoint: string, data: unknown) => Promise<void>;
}

export function FeaturesForm({ initial, onSave }: FeaturesFormProps) {
  const [form, setForm] = useState<FeaturesConfig>(initial);
  const [saving, setSaving] = useState(false);

  function setBool(key: keyof FeaturesConfig, value: boolean) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setStr(key: keyof FeaturesConfig, value: string) {
    setForm((prev) => ({ ...prev, [key]: value || null }));
  }

  function setNum(key: keyof FeaturesConfig, value: string) {
    const n = Number.parseInt(value, 10);
    if (!Number.isNaN(n)) setForm((prev) => ({ ...prev, [key]: n }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave("updateFeatures", form);
      toast.success("Feature settings saved.");
    } catch (err) {
      toast.error(toUserMessage(err, "Failed to save feature settings"));
    } finally {
      setSaving(false);
    }
  }

  const boolFields: Array<{ key: keyof FeaturesConfig; label: string }> = [
    { key: "chatEnabled", label: "Chat Enabled" },
    { key: "onboardingEnabled", label: "Onboarding Enabled" },
    { key: "sharedModuleBilling", label: "Shared Module: Billing" },
    { key: "sharedModuleMonitoring", label: "Shared Module: Monitoring" },
    { key: "sharedModuleAnalytics", label: "Shared Module: Analytics" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Feature Flags</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3">
          {boolFields.map(({ key, label }) => (
            <div key={key} className="flex items-center gap-3">
              <Checkbox
                id={`feature-${key}`}
                checked={Boolean(form[key])}
                onCheckedChange={(checked) => setBool(key, Boolean(checked))}
              />
              <Label htmlFor={`feature-${key}`}>{label}</Label>
            </div>
          ))}
        </div>

        <div className="border-t border-border pt-4 space-y-4">
          <p className="text-sm font-medium text-muted-foreground">Onboarding</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="feature-defaultModel">Default Model</Label>
              <Input
                id="feature-defaultModel"
                value={form.onboardingDefaultModel ?? ""}
                onChange={(e) => setStr("onboardingDefaultModel", e.target.value)}
                placeholder="claude-3-5-sonnet"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="feature-maxCredits">Max Onboarding Credits</Label>
              <Input
                id="feature-maxCredits"
                type="number"
                value={form.onboardingMaxCredits}
                onChange={(e) => setNum("onboardingMaxCredits", e.target.value)}
                min={0}
              />
            </div>
            <div className="col-span-full space-y-1.5">
              <Label htmlFor="feature-welcomeMsg">Welcome Message</Label>
              <Input
                id="feature-welcomeMsg"
                value={form.onboardingWelcomeMsg ?? ""}
                onChange={(e) => setStr("onboardingWelcomeMsg", e.target.value)}
                placeholder="Welcome to the platform!"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Features"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
