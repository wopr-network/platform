"use client";

import { motion } from "framer-motion";
import { AlertTriangle, RefreshCw, Trash2, Zap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { GpuNode, GpuRegion, GpuSize, ProvisionRequest } from "@/lib/admin-gpu-api";
import {
  destroyGpuNode,
  listGpuNodes,
  listGpuRegions,
  listGpuSizes,
  provisionGpuNode,
  rebootGpuNode,
} from "@/lib/admin-gpu-api";
import { toUserMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

// ---- Status badge ----

const STATUS_STYLES: Record<string, string> = {
  running: "bg-terminal/15 text-terminal border-terminal/20",
  stopped: "bg-muted/40 text-muted-foreground border-border",
  provisioning: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  rebooting: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  error: "bg-destructive/15 text-destructive border-destructive/20",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide",
        STATUS_STYLES[status] ?? STATUS_STYLES.stopped,
      )}
    >
      {status}
    </span>
  );
}

// ---- KPI card ----

interface KpiCardProps {
  label: string;
  value: string;
  subtext?: string;
  valueClassName?: string;
  loading?: boolean;
  index: number;
}

function KpiCard({ label, value, subtext, valueClassName, loading, index }: KpiCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="bg-card border border-border rounded-sm p-4 transition-colors duration-150 hover:border-terminal/40"
    >
      <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">{label}</div>
      {loading ? (
        <div className="h-8 w-24 bg-muted animate-pulse rounded-sm" />
      ) : (
        <div className={cn("text-2xl font-bold tabular-nums", valueClassName ?? "text-foreground")}>
          {value}
        </div>
      )}
      {subtext && <div className="text-xs text-muted-foreground mt-1">{subtext}</div>}
    </motion.div>
  );
}

// ---- Provision form ----

interface ProvisionFormProps {
  regions: GpuRegion[];
  sizes: GpuSize[];
  onProvision: (req: ProvisionRequest) => Promise<void>;
  onCancel: () => void;
}

function ProvisionForm({ regions, sizes, onProvision, onCancel }: ProvisionFormProps) {
  const [name, setName] = useState("");
  const [region, setRegion] = useState(regions.find((r) => r.available)?.slug ?? "");
  const [size, setSize] = useState(sizes[0]?.slug ?? "");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (!region || !size) {
      toast.error("Region and size are required");
      return;
    }
    setSubmitting(true);
    try {
      await onProvision({ name: name.trim(), region, size });
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls =
    "w-full bg-secondary border border-border rounded-sm px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-terminal/50 transition-colors";

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="mx-6 mb-4 bg-card border border-terminal/20 rounded-sm p-4"
    >
      <div className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
        Provision New GPU Node
      </div>
      <form onSubmit={handleSubmit} className="grid grid-cols-4 gap-3 items-end">
        <div>
          <label htmlFor="gpu-name" className="text-xs text-muted-foreground block mb-1">
            Name
          </label>
          <input
            id="gpu-name"
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="gpu-node-1"
            required
          />
        </div>
        <div>
          <label htmlFor="gpu-region" className="text-xs text-muted-foreground block mb-1">
            Region
          </label>
          <select
            id="gpu-region"
            className={inputCls}
            value={region}
            onChange={(e) => setRegion(e.target.value)}
          >
            {regions.map((r) => (
              <option key={r.slug} value={r.slug} disabled={!r.available}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="gpu-size" className="text-xs text-muted-foreground block mb-1">
            Size
          </label>
          <select
            id="gpu-size"
            className={inputCls}
            value={size}
            onChange={(e) => setSize(e.target.value)}
          >
            {sizes.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name} — ${s.priceMonthly}/mo
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={submitting || !name.trim() || !region || !size}>
            {submitting ? "Provisioning…" : "Provision"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </motion.div>
  );
}

// ---- Main dashboard ----

export function GpuDashboard() {
  const [nodes, setNodes] = useState<GpuNode[]>([]);
  const [regions, setRegions] = useState<GpuRegion[]>([]);
  const [sizes, setSizes] = useState<GpuSize[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showProvision, setShowProvision] = useState(false);
  const [actionsInFlight, setActionsInFlight] = useState<Set<string>>(new Set());
  const [pendingDestroy, setPendingDestroy] = useState<{ id: string; name: string } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nodeList, regionList, sizeList] = await Promise.all([
        listGpuNodes(),
        listGpuRegions(),
        listGpuSizes(),
      ]);
      setNodes(nodeList);
      setRegions(regionList);
      setSizes(sizeList);
    } catch (e) {
      setError(toUserMessage(e, "Failed to load GPU data"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleProvision = async (req: ProvisionRequest) => {
    try {
      const node = await provisionGpuNode(req);
      setNodes((prev) => [node, ...prev]);
      setShowProvision(false);
      toast.success(`GPU node "${req.name}" is provisioning`);
    } catch (e) {
      toast.error(toUserMessage(e, "Failed to provision GPU node"));
    }
  };

  const handleReboot = async (id: string, name: string) => {
    setActionsInFlight((prev) => new Set(prev).add(id));
    try {
      const updated = await rebootGpuNode(id);
      setNodes((prev) => prev.map((n) => (n.id === id ? updated : n)));
      toast.success(`Rebooting "${name}"`);
    } catch (e) {
      toast.error(toUserMessage(e, "Reboot failed"));
    } finally {
      setActionsInFlight((prev) => {
        const s = new Set(prev);
        s.delete(id);
        return s;
      });
    }
  };

  const handleDestroy = async (id: string, name: string) => {
    setActionsInFlight((prev) => new Set(prev).add(id));
    try {
      await destroyGpuNode(id);
      setNodes((prev) => prev.filter((n) => n.id !== id));
      toast.success(`GPU node "${name}" destroyed`);
    } catch (e) {
      toast.error(toUserMessage(e, "Destroy failed"));
    } finally {
      setActionsInFlight((prev) => {
        const s = new Set(prev);
        s.delete(id);
        return s;
      });
    }
  };

  // KPI computations
  const runningNodes = nodes.filter((n) => n.status === "running");
  const errorNodes = nodes.filter((n) => n.status === "error");
  const utilizationValues = runningNodes
    .filter((n) => n.utilization != null)
    .map((n) => n.utilization as number);
  const avgUtilization =
    utilizationValues.length > 0
      ? utilizationValues.reduce((a, b) => a + b, 0) / utilizationValues.length
      : null;
  const tempValues = runningNodes
    .filter((n) => n.temperatureCelsius != null)
    .map((n) => n.temperatureCelsius as number);
  const avgTemp =
    tempValues.length > 0 ? tempValues.reduce((a, b) => a + b, 0) / tempValues.length : null;

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-6 pb-4">
        <h1 className="text-lg font-bold text-terminal">
          <span className="text-muted-foreground">&gt;</span> GPU Management
        </h1>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={loadData}
            disabled={loading}
            className="font-mono bg-secondary text-muted-foreground hover:bg-secondary/80"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            Refresh
          </Button>
          <Button
            type="button"
            size="xs"
            onClick={() => setShowProvision((v) => !v)}
            className="font-mono"
          >
            <Zap size={12} />
            Provision Node
          </Button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="mx-6 p-4 bg-card border border-destructive/30 rounded-sm text-destructive text-sm flex items-center gap-2">
          <AlertTriangle size={14} />
          {error}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 px-6">
        <KpiCard
          index={0}
          label="Total Nodes"
          value={loading ? "" : String(nodes.length)}
          loading={loading}
        />
        <KpiCard
          index={1}
          label="Running"
          value={loading ? "" : String(runningNodes.length)}
          valueClassName="text-terminal"
          loading={loading}
        />
        <KpiCard
          index={2}
          label="Avg Utilization"
          value={loading ? "" : avgUtilization != null ? `${avgUtilization.toFixed(1)}%` : "—"}
          valueClassName={
            avgUtilization != null && avgUtilization > 85 ? "text-amber-400" : "text-foreground"
          }
          subtext="running nodes"
          loading={loading}
        />
        <KpiCard
          index={3}
          label="Avg Temp"
          value={loading ? "" : avgTemp != null ? `${avgTemp.toFixed(0)}°C` : "—"}
          valueClassName={
            avgTemp != null && avgTemp > 80
              ? "text-destructive"
              : avgTemp != null && avgTemp > 70
                ? "text-amber-400"
                : "text-foreground"
          }
          subtext={errorNodes.length > 0 ? `${errorNodes.length} node(s) in error` : undefined}
          loading={loading}
        />
      </div>

      {/* Provision form */}
      {showProvision && !loading && (
        <ProvisionForm
          regions={regions}
          sizes={sizes}
          onProvision={handleProvision}
          onCancel={() => setShowProvision(false)}
        />
      )}

      {/* GPU Inventory Table */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.15 }}
        className="mx-6 bg-card border border-border rounded-sm"
      >
        <div className="px-4 py-3 border-b border-border">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            GPU Inventory
          </div>
        </div>

        {loading ? (
          <div className="space-y-0">
            {Array.from({ length: 4 }, (_, n) => `sk-${n}`).map((id) => (
              <div key={id} className="flex items-center gap-4 px-4 py-3 border-b last:border-0">
                <div className="h-4 w-32 bg-muted animate-pulse rounded-sm" />
                <div className="h-4 w-40 bg-muted animate-pulse rounded-sm" />
                <div className="h-5 w-20 bg-muted animate-pulse rounded-sm" />
                <div className="h-4 w-16 bg-muted animate-pulse rounded-sm" />
                <div className="h-4 w-16 bg-muted animate-pulse rounded-sm" />
                <div className="h-4 w-24 bg-muted animate-pulse rounded-sm" />
              </div>
            ))}
          </div>
        ) : nodes.length === 0 ? (
          <div className="text-center text-muted-foreground text-xs py-12">
            No GPU nodes provisioned
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="flex text-xs uppercase tracking-widest text-muted-foreground border-b border-border px-4 py-2">
              <div className="w-40">Name</div>
              <div className="w-28">Region</div>
              <div className="w-32">Size</div>
              <div className="w-24">Status</div>
              <div className="w-24 text-right">Utilization</div>
              <div className="w-24 text-right">Temp</div>
              <div className="flex-1 text-right">VRAM</div>
              <div className="w-28 text-right">Actions</div>
            </div>

            {nodes.map((node) => {
              const vramPct =
                node.memoryTotalMib != null && node.memoryUsedMib != null && node.memoryTotalMib > 0
                  ? `${Math.round((node.memoryUsedMib / node.memoryTotalMib) * 100)}%`
                  : null;
              const busy = actionsInFlight.has(node.id);

              return (
                <div
                  key={node.id}
                  className="flex items-center px-4 py-3 border-b border-border last:border-0 hover:bg-secondary/30 transition-colors duration-100"
                >
                  <div className="w-40 text-sm font-medium truncate" title={node.name}>
                    {node.name}
                  </div>
                  <div className="w-28 text-sm text-muted-foreground">{node.region}</div>
                  <div className="w-32 text-sm text-muted-foreground truncate">{node.size}</div>
                  <div className="w-24">
                    <StatusBadge status={node.status} />
                  </div>
                  <div
                    className={cn(
                      "w-24 text-right tabular-nums text-sm",
                      node.utilization != null && node.utilization > 85
                        ? "text-amber-400"
                        : "text-foreground",
                    )}
                  >
                    {node.utilization != null ? `${node.utilization}%` : "—"}
                  </div>
                  <div
                    className={cn(
                      "w-24 text-right tabular-nums text-sm",
                      node.temperatureCelsius != null && node.temperatureCelsius > 80
                        ? "text-destructive"
                        : node.temperatureCelsius != null && node.temperatureCelsius > 70
                          ? "text-amber-400"
                          : "text-foreground",
                    )}
                  >
                    {node.temperatureCelsius != null ? `${node.temperatureCelsius}°C` : "—"}
                  </div>
                  <div className="flex-1 text-right tabular-nums text-sm text-muted-foreground">
                    {vramPct != null
                      ? `${vramPct} (${node.memoryUsedMib} / ${node.memoryTotalMib} MiB)`
                      : "—"}
                  </div>
                  <div className="w-28 flex justify-end gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      disabled={busy || node.status === "provisioning"}
                      onClick={() => handleReboot(node.id, node.name)}
                      title="Reboot"
                    >
                      <RefreshCw size={12} />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      disabled={busy || node.status === "provisioning"}
                      onClick={() => setPendingDestroy({ id: node.id, name: node.name })}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      title="Destroy"
                    >
                      <Trash2 size={12} />
                    </Button>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </motion.div>

      {/* Allocation — stubbed */}
      <div className="mx-6 bg-card border border-border rounded-sm p-4">
        <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
          Allocation / Tenant Mapping
        </div>
        <p className="text-xs text-muted-foreground">
          Tenant-to-GPU allocation endpoints are not yet available. This section will display which
          bots and tenants are assigned to each GPU node once the backend implements the allocation
          API.
        </p>
      </div>

      {/* Configuration — stubbed */}
      <div className="mx-6 mb-6 bg-card border border-border rounded-sm p-4">
        <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
          GPU Configuration
        </div>
        <p className="text-xs text-muted-foreground">
          GPU capability enable/disable and allocation limit configuration endpoints are not yet
          available. This section will provide controls once the backend exposes the configuration
          API.
        </p>
      </div>

      {/* Destroy confirmation dialog */}
      <AlertDialog
        open={pendingDestroy != null}
        onOpenChange={(open) => {
          if (!open) setPendingDestroy(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Destroy GPU Node</AlertDialogTitle>
            <AlertDialogDescription>
              Destroy GPU node &ldquo;{pendingDestroy?.name}&rdquo;? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingDestroy) {
                  handleDestroy(pendingDestroy.id, pendingDestroy.name);
                  setPendingDestroy(null);
                }
              }}
            >
              Destroy
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
