"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getPoolConfig, type PoolConfig, setPoolSize } from "@/lib/admin-pool-api";

export function PoolConfigDashboard() {
  const [config, setConfig] = useState<PoolConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sizeInput, setSizeInput] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await getPoolConfig();
      setConfig(data);
      setSizeInput(String(data.poolSize));
    } catch {
      toast.error("Failed to load pool config");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    const size = Number.parseInt(sizeInput, 10);
    if (Number.isNaN(size) || size < 0 || size > 50) {
      toast.error("Pool size must be between 0 and 50");
      return;
    }
    setSaving(true);
    try {
      const result = await setPoolSize(size);
      setConfig((prev) => (prev ? { ...prev, poolSize: result.poolSize } : prev));
      toast.success(`Pool size updated to ${result.poolSize}`);
    } catch {
      toast.error("Failed to update pool size");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (!config) {
    return <div className="p-6 text-muted-foreground">Failed to load pool configuration.</div>;
  }

  if (!config.enabled) {
    return (
      <div className="p-6">
        <h2 className="text-lg font-semibold mb-2">Hot Pool</h2>
        <p className="text-muted-foreground">
          Hot pool is not enabled for this product. Enable the{" "}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">hotPool</code> feature flag in the
          boot config to use pre-provisioned instances.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-lg font-semibold">Hot Pool</h2>
        <p className="text-sm text-muted-foreground">
          Pre-provisioned warm containers for instant instance creation.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">Target Size</div>
          <div className="mt-1 text-2xl font-bold text-terminal">{config.poolSize}</div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">Warm Containers</div>
          <div className="mt-1 text-2xl font-bold text-green-400">{config.warmCount}</div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">Status</div>
          <div className="mt-1 text-2xl font-bold">
            {config.warmCount >= config.poolSize ? (
              <span className="text-green-400">Full</span>
            ) : config.warmCount > 0 ? (
              <span className="text-amber-400">Filling</span>
            ) : (
              <span className="text-red-400">Empty</span>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="text-sm font-medium mb-3">Adjust Pool Size</div>
        <div className="flex items-center gap-3">
          <Input
            type="number"
            min={0}
            max={50}
            value={sizeInput}
            onChange={(e) => setSizeInput(e.target.value)}
            className="w-24"
          />
          <Button
            onClick={handleSave}
            disabled={saving || sizeInput === String(config.poolSize)}
            size="sm"
          >
            {saving ? "Saving..." : "Update"}
          </Button>
          <span className="text-xs text-muted-foreground">
            The pool manager will replenish to this target within 60 seconds.
          </span>
        </div>
      </div>
    </div>
  );
}
