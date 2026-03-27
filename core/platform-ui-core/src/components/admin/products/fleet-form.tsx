"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toUserMessage } from "@/lib/errors";

interface FleetConfig {
  containerImage: string;
  containerPort: number;
  lifecycle: string;
  billingModel: string;
  maxInstances: number;
  dockerNetwork: string;
  placementStrategy: string;
  fleetDataDir: string;
}

interface FleetFormProps {
  initial: FleetConfig;
  onSave: (endpoint: string, data: unknown) => Promise<void>;
}

export function FleetForm({ initial, onSave }: FleetFormProps) {
  const [form, setForm] = useState<FleetConfig>(initial);
  const [saving, setSaving] = useState(false);

  function setStr(key: keyof FleetConfig, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setNum(key: keyof FleetConfig, value: string) {
    setForm((prev) => ({ ...prev, [key]: value === "" ? 0 : Number.parseInt(value, 10) }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave("updateFleet", form);
      toast.success("Fleet settings saved.");
    } catch (err) {
      toast.error(toUserMessage(err, "Failed to save fleet settings"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fleet Configuration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="col-span-full space-y-1.5">
            <Label htmlFor="fleet-image">Container Image</Label>
            <Input
              id="fleet-image"
              value={form.containerImage}
              onChange={(e) => setStr("containerImage", e.target.value)}
              placeholder="ghcr.io/wopr-network/agent:latest"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fleet-port">Container Port</Label>
            <Input
              id="fleet-port"
              type="number"
              value={form.containerPort}
              onChange={(e) => setNum("containerPort", e.target.value)}
              min={1}
              max={65535}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fleet-maxInstances">Max Instances</Label>
            <Input
              id="fleet-maxInstances"
              type="number"
              value={form.maxInstances}
              onChange={(e) => setNum("maxInstances", e.target.value)}
              min={1}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fleet-lifecycle">Lifecycle</Label>
            <Select value={form.lifecycle} onValueChange={(v) => setStr("lifecycle", v)}>
              <SelectTrigger id="fleet-lifecycle">
                <SelectValue placeholder="Select lifecycle" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="managed">Managed</SelectItem>
                <SelectItem value="ephemeral">Ephemeral</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fleet-billingModel">Billing Model</Label>
            <Select value={form.billingModel} onValueChange={(v) => setStr("billingModel", v)}>
              <SelectTrigger id="fleet-billingModel">
                <SelectValue placeholder="Select billing model" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="per_use">Per Use</SelectItem>
                <SelectItem value="none">None</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fleet-placementStrategy">Placement Strategy</Label>
            <Select
              value={form.placementStrategy}
              onValueChange={(v) => setStr("placementStrategy", v)}
            >
              <SelectTrigger id="fleet-placementStrategy">
                <SelectValue placeholder="Select strategy" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="round_robin">Round Robin</SelectItem>
                <SelectItem value="least_loaded">Least Loaded</SelectItem>
                <SelectItem value="random">Random</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fleet-dockerNetwork">Docker Network</Label>
            <Input
              id="fleet-dockerNetwork"
              value={form.dockerNetwork}
              onChange={(e) => setStr("dockerNetwork", e.target.value)}
              placeholder="platform"
            />
          </div>

          <div className="col-span-full space-y-1.5">
            <Label htmlFor="fleet-dataDir">Fleet Data Directory</Label>
            <Input
              id="fleet-dataDir"
              value={form.fleetDataDir}
              onChange={(e) => setStr("fleetDataDir", e.target.value)}
              placeholder="/data/fleet"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Fleet"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
