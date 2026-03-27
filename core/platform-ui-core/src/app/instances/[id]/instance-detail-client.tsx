"use client";

import {
  ArrowDownToLine,
  ArrowLeft,
  Check,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { FriendsTab } from "@/components/instances/friends-tab";
import { HealthOverview } from "@/components/observability/health-overview";
import { LogsViewer } from "@/components/observability/logs-viewer";
import { MetricsDashboard } from "@/components/observability/metrics-dashboard";
import { StatusBadge } from "@/components/status-badge";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useImageStatus } from "@/hooks/use-image-status";
import type { InstanceDetail, InstanceStatus, Snapshot } from "@/lib/api";
import {
  controlInstance,
  createSnapshot,
  deleteSnapshot,
  getInstance,
  getInstanceSecretKeys,
  listSnapshots,
  pullImageUpdate,
  renameInstance,
  restoreSnapshot,
  toggleInstancePlugin,
  updateInstanceConfig,
  updateInstanceSecrets,
} from "@/lib/api";
import { toUserMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

export function InstanceDetailClient({ instanceId }: { instanceId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultTab = searchParams.get("tab") ?? "overview";
  const [instance, setInstance] = useState<InstanceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [configText, setConfigText] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [configStatus, setConfigStatus] = useState<"idle" | "saved" | "invalid" | "error">("idle");
  const [configError, setConfigError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [snapshotsLoading, setSnapshotsLoading] = useState(false);
  const [snapshotsError, setSnapshotsError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState<Snapshot | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Snapshot | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState(defaultTab);
  const snapshotsLoaded = useRef(false);
  const [destroyOpen, setDestroyOpen] = useState(false);
  const [destroyConfirmText, setDestroyConfirmText] = useState("");
  const [destroying, setDestroying] = useState(false);
  const { updateAvailable, error: imageStatusError } = useImageStatus(instanceId);
  const [pulling, setPulling] = useState(false);
  const [confirmPull, setConfirmPull] = useState(false);
  const [togglingPlugin, setTogglingPlugin] = useState<string | null>(null);
  const [secretKeys, setSecretKeys] = useState<string[]>([]);
  const [secretValues, setSecretValues] = useState<Record<string, string>>({});
  const [secretsLoading, setSecretsLoading] = useState(false);
  const [secretsSaving, setSecretsSaving] = useState(false);
  const [secretsStatus, setSecretsStatus] = useState<"idle" | "saved" | "error">("idle");
  const [secretsError, setSecretsError] = useState<string | null>(null);
  const nextSecretId = useRef(0);
  const [newSecretRows, setNewSecretRows] = useState<{ id: number; key: string; value: string }[]>(
    [],
  );
  const secretsLoaded = useRef(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  useEffect(() => {
    if (!configText.trim()) return;
    try {
      JSON.parse(configText);
      setConfigStatus((prev) => (prev === "invalid" ? "idle" : prev));
    } catch {
      setConfigStatus("invalid");
    }
  }, [configText]);

  async function handleTogglePlugin(pluginId: string, enabled: boolean) {
    if (!instance) return;
    setActionError(null);
    setTogglingPlugin(pluginId);

    const previousPlugins = instance.plugins;
    setInstance({
      ...instance,
      plugins: instance.plugins.map((p) => (p.id === pluginId ? { ...p, enabled } : p)),
    });

    try {
      await toggleInstancePlugin(instanceId, pluginId, enabled);
    } catch (err) {
      setInstance((prev) => (prev ? { ...prev, plugins: previousPlugins } : prev));
      setActionError(toUserMessage(err, "Failed to toggle plugin"));
    } finally {
      setTogglingPlugin(null);
    }
  }

  async function handleRename() {
    if (!instance || !renameValue.trim() || renameValue.trim() === instance.name) {
      setRenaming(false);
      return;
    }
    setRenameSaving(true);
    const previousName = instance.name;
    setInstance((prev) => (prev ? { ...prev, name: renameValue.trim() } : prev));
    try {
      await renameInstance(instanceId, renameValue.trim());
      setRenaming(false);
    } catch (err) {
      setInstance((prev) => (prev ? { ...prev, name: previousName } : prev));
      setActionError(toUserMessage(err, "Failed to rename instance"));
      setRenaming(false);
    } finally {
      setRenameSaving(false);
    }
  }

  async function handlePullUpdate() {
    setConfirmPull(false);
    setPulling(true);
    try {
      await pullImageUpdate(instanceId);
      await load();
    } catch (err) {
      setActionError(toUserMessage(err, "Failed to pull update"));
    } finally {
      setPulling(false);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getInstance(instanceId);
      setInstance(data);
      setConfigText(JSON.stringify(data.config, null, 2));
    } catch (err) {
      setError(toUserMessage(err, "Failed to load instance"));
    } finally {
      setLoading(false);
    }
  }, [instanceId]);

  const loadSnapshots = useCallback(async () => {
    setSnapshotsLoading(true);
    setSnapshotsError(null);
    try {
      const data = await listSnapshots(instanceId);
      setSnapshots(data);
    } catch (err) {
      setSnapshotsError(toUserMessage(err, "Failed to load snapshots"));
    } finally {
      setSnapshotsLoading(false);
    }
  }, [instanceId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (activeTab === "snapshots" && !snapshotsLoaded.current) {
      snapshotsLoaded.current = true;
      loadSnapshots();
    }
  }, [activeTab, loadSnapshots]);

  const loadSecrets = useCallback(async () => {
    setSecretsLoading(true);
    setSecretsError(null);
    try {
      const keys = await getInstanceSecretKeys(instanceId);
      setSecretKeys(keys);
      setSecretValues({});
      setNewSecretRows([]);
      setSecretsStatus("idle");
    } catch (err) {
      setSecretKeys([]);
      setSecretsStatus("error");
      setSecretsError(toUserMessage(err, "Failed to load secrets"));
    } finally {
      setSecretsLoading(false);
    }
  }, [instanceId]);

  useEffect(() => {
    if (activeTab === "config" && !secretsLoaded.current) {
      secretsLoaded.current = true;
      loadSecrets();
    }
  }, [activeTab, loadSecrets]);

  async function handleSaveSecrets() {
    setSecretsError(null);
    setSecretsStatus("idle");
    const payload: Record<string, string> = {};
    for (const key of secretKeys) {
      const val = secretValues[key];
      if (val?.trim()) {
        payload[key] = val.trim();
      }
    }
    // Check for new rows whose key duplicates an existing secret key.
    const duplicates = newSecretRows
      .map((row) => row.key.trim())
      .filter((k) => k && secretKeys.includes(k));
    if (duplicates.length > 0) {
      setSecretsStatus("error");
      setSecretsError(
        `Duplicate secret key${duplicates.length > 1 ? "s" : ""}: ${duplicates.join(", ")}. Use the existing field above to update it.`,
      );
      return;
    }
    for (const row of newSecretRows) {
      if (row.key.trim() && row.value.trim()) {
        payload[row.key.trim()] = row.value.trim();
      }
    }
    if (Object.keys(payload).length === 0) {
      setSecretsStatus("error");
      setSecretsError("No secret values to save");
      return;
    }
    setSecretsSaving(true);
    try {
      await updateInstanceSecrets(instanceId, payload);
      setSecretsStatus("saved");
      setSecretValues({});
      setNewSecretRows([]);
      await loadSecrets();
    } catch (err) {
      setSecretsStatus("error");
      setSecretsError(toUserMessage(err, "Failed to save secrets"));
    } finally {
      setSecretsSaving(false);
    }
  }

  async function handleAction(action: "start" | "stop" | "restart" | "destroy") {
    setActionError(null);
    try {
      await controlInstance(instanceId, action);
      await load();
    } catch (err) {
      setActionError(toUserMessage(err, `Failed to ${action} instance`));
    }
  }

  async function handleCreateSnapshot() {
    setSnapshotsError(null);
    setCreating(true);
    try {
      await createSnapshot(instanceId);
      await loadSnapshots();
    } catch (err) {
      setSnapshotsError(toUserMessage(err, "Failed to create snapshot"));
    } finally {
      setCreating(false);
    }
  }

  async function handleRestore(snapshot: Snapshot) {
    setRestoring(true);
    try {
      await restoreSnapshot(instanceId, snapshot.id);
      setConfirmRestore(null);
      await load();
      await loadSnapshots();
    } catch (err) {
      setSnapshotsError(toUserMessage(err, "Failed to restore snapshot"));
      setConfirmRestore(null);
    } finally {
      setRestoring(false);
    }
  }

  async function handleDelete(snapshot: Snapshot) {
    setSnapshotsError(null);
    setDeleting(true);
    try {
      await deleteSnapshot(instanceId, snapshot.id);
      setConfirmDelete(null);
      await loadSnapshots();
    } catch (err) {
      setSnapshotsError(toUserMessage(err, "Failed to delete snapshot"));
      setConfirmDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-7 w-48" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-20" />
          </div>
        </div>
        <Skeleton className="h-px w-full" />
        <Skeleton className="h-9 w-96" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, n) => `sk-${n}`).map((skId) => (
            <div key={skId} className="rounded-sm border p-4 space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-5 w-20" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !instance) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">{error ?? "Instance not found"}</p>
        <Button variant="outline" asChild>
          <Link href="/instances">Back to Instances</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/instances" className="inline-flex items-center gap-1">
                <ArrowLeft className="size-4" />
                Instances
              </Link>
            </Button>
          </div>
          {renaming ? (
            <div className="flex items-center gap-2">
              <Input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRename();
                  if (e.key === "Escape") setRenaming(false);
                }}
                className="h-9 w-64 text-lg font-bold"
                disabled={renameSaving}
              />
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={handleRename}
                disabled={renameSaving}
                aria-label="Confirm rename"
              >
                {renameSaving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setRenaming(false)}
                disabled={renameSaving}
                aria-label="Cancel rename"
              >
                <X className="size-4" />
              </Button>
            </div>
          ) : (
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              {instance.name}
              <span
                className={cn("size-2 rounded-full", {
                  "bg-emerald-500 animate-[pulse-dot_2s_ease-in-out_infinite]":
                    instance.status === "running",
                  "bg-zinc-400": instance.status === "stopped",
                  "bg-yellow-500": instance.status === "degraded",
                  "bg-red-500 animate-[pulse-dot_0.8s_ease-in-out_infinite]":
                    instance.status === "error",
                })}
              />
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => {
                  setRenameValue(instance.name);
                  setRenaming(true);
                }}
                aria-label="Rename"
              >
                <Pencil className="size-3.5 text-muted-foreground" />
              </Button>
            </h1>
          )}
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <StatusBadge status={instance.status} />
            {imageStatusError && (
              <span className="text-xs text-destructive">{imageStatusError}</span>
            )}
            {updateAvailable && (
              <Badge
                variant="outline"
                className="gap-1.5 bg-amber-500/15 text-amber-500 border-amber-500/25"
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full bg-amber-500",
                    pulling && "animate-[pulse-dot_0.8s_ease-in-out_infinite]",
                  )}
                />
                <span className="text-[11px] font-mono uppercase tracking-wider">
                  {pulling ? "Pulling..." : "Update available"}
                </span>
              </Badge>
            )}
            <span>{instance.provider}</span>
          </div>
        </div>
        <div className="flex gap-2">
          {updateAvailable && (
            <Button
              size="sm"
              variant="outline"
              className="border-amber-500/30 text-amber-500 hover:bg-amber-500/10 hover:text-amber-500 hover:border-amber-500/50 focus-visible:ring-amber-500/30 transition-colors duration-150"
              onClick={() => setConfirmPull(true)}
              disabled={pulling}
            >
              {pulling ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <ArrowDownToLine className="mr-1.5 size-4" />
              )}
              {pulling ? "Pulling..." : "Pull Update"}
            </Button>
          )}
          {instance.status === "stopped" && (
            <Button size="sm" variant="terminal" onClick={() => handleAction("start")}>
              Start
            </Button>
          )}
          {(instance.status === "running" || instance.status === "degraded") && (
            <>
              <Button size="sm" variant="outline" onClick={() => handleAction("stop")}>
                Stop
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleAction("restart")}>
                Restart
              </Button>
            </>
          )}
          <Button size="sm" variant="destructive" onClick={() => setDestroyOpen(true)}>
            Destroy
          </Button>
        </div>
      </div>

      {actionError && (
        <div className="rounded-md border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          {actionError}
        </div>
      )}

      <Separator />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-transparent border-b border-border rounded-none p-0 h-auto gap-0">
          {[
            "overview",
            "health",
            "metrics",
            "logs",
            "plugins",
            "channels",
            "friends",
            "sessions",
            "snapshots",
            "config",
          ].map((tab) => (
            <TabsTrigger
              key={tab}
              value={tab}
              className="rounded-none border-b-2 border-transparent px-4 py-2 text-sm capitalize text-muted-foreground data-[state=active]:border-b-terminal data-[state=active]:text-terminal data-[state=active]:shadow-none data-[state=active]:bg-transparent"
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard title="Status" value={instance.status} status={instance.status} />
            <MetricCard title="Uptime" value={formatUptime(instance.uptime)} />
            <MetricCard
              title="Memory"
              value={`${instance.resourceUsage.memoryMb} MB`}
              progress={instance.resourceUsage.memoryMb / 10.24}
            />
            <MetricCard
              title="CPU"
              value={`${instance.resourceUsage.cpuPercent}%`}
              progress={instance.resourceUsage.cpuPercent}
            />
            <MetricCard title="Plugins" value={String(instance.plugins.length)} />
            <MetricCard title="Channels" value={String(instance.channelDetails.length)} />
            <MetricCard title="Active Sessions" value={String(instance.sessions.length)} />
            <MetricCard title="Created" value={new Date(instance.createdAt).toLocaleDateString()} />
          </div>
        </TabsContent>

        {/* Health Tab */}
        <TabsContent value="health" className="mt-4">
          <HealthOverview instanceId={instanceId} />
        </TabsContent>

        {/* Metrics Tab */}
        <TabsContent value="metrics" className="mt-4">
          <MetricsDashboard instanceId={instanceId} />
        </TabsContent>

        {/* Logs Tab (enhanced) */}
        <TabsContent value="logs" className="mt-4">
          <LogsViewer instanceId={instanceId} />
        </TabsContent>

        {/* Plugins Tab */}
        <TabsContent value="plugins" className="mt-4">
          {instance.plugins.length === 0 ? (
            <p className="text-muted-foreground">No plugins installed.</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plugin</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead className="w-[100px]">Enabled</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {instance.plugins.map((plugin) => (
                    <TableRow
                      key={plugin.id}
                      className="transition-colors hover:bg-muted/50 even:bg-muted/20"
                    >
                      <TableCell className="font-medium">{plugin.name}</TableCell>
                      <TableCell className="text-muted-foreground">{plugin.version}</TableCell>
                      <TableCell>
                        <span
                          className={
                            togglingPlugin === plugin.id
                              ? "opacity-70 cursor-wait transition-opacity duration-150"
                              : "transition-opacity duration-150"
                          }
                        >
                          <Switch
                            checked={plugin.enabled}
                            disabled={togglingPlugin !== null}
                            onCheckedChange={(checked) => handleTogglePlugin(plugin.id, checked)}
                            className="data-[state=checked]:bg-emerald-500 dark:data-[state=checked]:bg-emerald-500"
                            aria-label={`Toggle ${plugin.name}`}
                          />
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* Channels Tab */}
        <TabsContent value="channels" className="mt-4">
          {instance.channelDetails.length === 0 ? (
            <p className="text-muted-foreground">No channels connected.</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Channel</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {instance.channelDetails.map((ch) => (
                    <TableRow
                      key={ch.id}
                      className="transition-colors hover:bg-muted/50 even:bg-muted/20"
                    >
                      <TableCell className="font-medium">{ch.name}</TableCell>
                      <TableCell className="text-muted-foreground">{ch.type}</TableCell>
                      <TableCell>
                        <ChannelStatusBadge status={ch.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* Friends Tab */}
        <TabsContent value="friends" className="mt-4">
          <FriendsTab instanceId={instanceId} />
        </TabsContent>

        {/* Sessions Tab */}
        <TabsContent value="sessions" className="mt-4">
          {instance.sessions.length === 0 ? (
            <p className="text-muted-foreground">No active sessions.</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Session ID</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Messages</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Last Activity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {instance.sessions.map((sess) => (
                    <TableRow
                      key={sess.id}
                      className="transition-colors hover:bg-muted/50 even:bg-muted/20"
                    >
                      <TableCell className="font-mono text-sm">{sess.id}</TableCell>
                      <TableCell>{sess.userId}</TableCell>
                      <TableCell>{sess.messageCount}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(sess.startedAt).toLocaleTimeString()}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(sess.lastActivityAt).toLocaleTimeString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* Snapshots Tab */}
        <TabsContent value="snapshots" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted-foreground">
              {snapshots.length} snapshot{snapshots.length !== 1 ? "s" : ""}
            </h3>
            <Button size="sm" onClick={handleCreateSnapshot} disabled={creating}>
              {creating ? "Creating..." : "Create Snapshot"}
            </Button>
          </div>

          {snapshotsError && (
            <div className="rounded-md border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-500">
              {snapshotsError}
            </div>
          )}

          {snapshotsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }, (_, i) => `snap-sk-${i}`).map((skId) => (
                <Skeleton key={skId} className="h-12 w-full" />
              ))}
            </div>
          ) : snapshots.length === 0 ? (
            <p className="text-muted-foreground">No snapshots yet.</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {snapshots.map((snap) => (
                    <TableRow
                      key={snap.id}
                      className="transition-colors hover:bg-muted/50 even:bg-muted/20"
                    >
                      <TableCell className="font-medium">
                        {snap.name ?? <span className="text-muted-foreground italic">unnamed</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{snap.type}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{snap.trigger}</TableCell>
                      <TableCell className="text-muted-foreground">{snap.sizeMb} MB</TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(snap.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setConfirmRestore(snap)}
                          >
                            Restore
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setConfirmDelete(snap)}
                          >
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Restore confirmation dialog */}
          <Dialog open={!!confirmRestore} onOpenChange={(open) => !open && setConfirmRestore(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Restore Snapshot</DialogTitle>
                <DialogDescription>This will restart your bot from this snapshot</DialogDescription>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                Restoring from snapshot <span className="font-mono">{confirmRestore?.id}</span>
                {confirmRestore?.name ? ` (${confirmRestore.name})` : ""} created on{" "}
                {confirmRestore ? new Date(confirmRestore.createdAt).toLocaleString() : ""}.
              </p>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setConfirmRestore(null)}
                  disabled={restoring}
                >
                  Cancel
                </Button>
                <Button
                  variant="terminal"
                  onClick={() => confirmRestore && handleRestore(confirmRestore)}
                  disabled={restoring}
                >
                  {restoring ? "Restoring..." : "Confirm Restore"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Delete confirmation dialog */}
          <Dialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete Snapshot</DialogTitle>
                <DialogDescription>
                  This will permanently delete this snapshot. This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setConfirmDelete(null)}
                  disabled={deleting}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => confirmDelete && handleDelete(confirmDelete)}
                  disabled={deleting}
                >
                  {deleting ? "Deleting..." : "Delete Snapshot"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Config Tab */}
        <TabsContent value="config" className="mt-4 space-y-4">
          <div className="space-y-2">
            <label htmlFor="config-editor" className="text-sm font-medium">
              Instance Configuration (JSON)
            </label>
            <div
              className={cn(
                "relative rounded-md border bg-black/80 overflow-hidden",
                configStatus === "invalid" ? "border-red-500" : "border-border",
              )}
            >
              <div className="flex items-center gap-2 border-b border-border/50 px-3 py-1.5 text-xs text-muted-foreground">
                <span className="inline-block h-2 w-2 rounded-full bg-terminal" />
                <span>CONFIG EDITOR</span>
              </div>
              <Textarea
                id="config-editor"
                className="min-h-[300px] font-mono text-sm bg-transparent border-0 rounded-none focus-visible:ring-0 text-terminal/90 resize-y"
                value={configText}
                onChange={(e) => setConfigText(e.target.value)}
                spellCheck={false}
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-3">
            {saving && <span className="text-sm text-muted-foreground">Saving...</span>}
            {configStatus === "saved" && !saving && (
              <span className="text-sm text-emerald-500">Config saved</span>
            )}
            {configStatus === "invalid" && (
              <span className="text-sm text-red-500">Invalid JSON</span>
            )}
            {configStatus === "error" && configError && (
              <span className="text-sm text-red-500">{configError}</span>
            )}
            <Button
              disabled={saving || configStatus === "invalid"}
              onClick={async () => {
                setConfigError(null);
                let parsed: unknown;
                try {
                  parsed = JSON.parse(configText);
                } catch {
                  setConfigStatus("invalid");
                  return;
                }
                if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
                  setConfigStatus("invalid");
                  return;
                }
                setConfigStatus("idle");
                setSaving(true);
                try {
                  const env: Record<string, string> = {};
                  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
                    if (
                      v === null ||
                      (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean")
                    ) {
                      throw new Error(`Value for key "${k}" must be a string, number, or boolean`);
                    }
                    env[k] = String(v);
                  }
                  await updateInstanceConfig(instanceId, env);
                  setConfigStatus("saved");
                } catch (err) {
                  setConfigStatus("error");
                  setConfigError(toUserMessage(err, "Failed to save config"));
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? "Saving..." : "Save Config"}
            </Button>
          </div>

          <Separator className="my-6" />

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium">Secrets</h3>
                <p className="text-xs text-muted-foreground">
                  Write-only. Stored values are never displayed.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const id = nextSecretId.current++;
                  setNewSecretRows((prev) => [...prev, { id, key: "", value: "" }]);
                }}
              >
                <Plus className="mr-1.5 size-3.5" />
                Add Secret
              </Button>
            </div>

            {secretsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : secretKeys.length === 0 && newSecretRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No secrets configured.</p>
            ) : (
              <div className="rounded-md border border-border bg-black/80 overflow-hidden">
                <div className="flex items-center gap-2 border-b border-border/50 px-3 py-1.5 text-xs text-muted-foreground">
                  <Lock className="size-3 text-terminal" />
                  <span>SECRETS VAULT</span>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Key</TableHead>
                      <TableHead>Value</TableHead>
                      <TableHead className="w-[60px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {secretKeys.map((key) => (
                      <TableRow key={key} className="hover:bg-muted/50">
                        <TableCell className="font-mono text-sm">
                          {key}
                          <Badge
                            variant="outline"
                            className="ml-2 text-[10px] border-terminal/30 text-terminal/70 bg-terminal/5"
                          >
                            SET
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="password"
                            placeholder="Enter new value..."
                            value={secretValues[key] ?? ""}
                            onChange={(e) =>
                              setSecretValues((prev) => ({ ...prev, [key]: e.target.value }))
                            }
                            className="font-mono text-sm bg-transparent border-border focus:ring-terminal/50 focus:border-terminal/50"
                          />
                        </TableCell>
                        <TableCell />
                      </TableRow>
                    ))}
                    {newSecretRows.map((row) => (
                      <TableRow key={`new-${row.id}`} className="hover:bg-muted/50">
                        <TableCell>
                          <Input
                            placeholder="SECRET_KEY_NAME"
                            value={row.key}
                            onChange={(e) =>
                              setNewSecretRows((prev) =>
                                prev.map((r) =>
                                  r.id === row.id ? { ...r, key: e.target.value } : r,
                                ),
                              )
                            }
                            className="font-mono text-sm bg-transparent"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="password"
                            placeholder="Enter value..."
                            value={row.value}
                            onChange={(e) =>
                              setNewSecretRows((prev) =>
                                prev.map((r) =>
                                  r.id === row.id ? { ...r, value: e.target.value } : r,
                                ),
                              )
                            }
                            className="font-mono text-sm bg-transparent"
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setNewSecretRows((prev) => prev.filter((r) => r.id !== row.id))
                            }
                          >
                            <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="flex items-center justify-end gap-3">
              {secretsSaving && <span className="text-sm text-muted-foreground">Saving...</span>}
              {secretsStatus === "saved" && !secretsSaving && (
                <span className="text-sm text-emerald-500">Secrets saved</span>
              )}
              {secretsStatus === "error" && secretsError && (
                <span className="text-sm text-red-500">{secretsError}</span>
              )}
              <Button disabled={secretsSaving} onClick={handleSaveSecrets}>
                {secretsSaving ? "Saving..." : "Save Secrets"}
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Destroy confirmation dialog */}
      <Dialog
        open={destroyOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDestroyOpen(false);
            setDestroyConfirmText("");
            setActionError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Destroy {instance.name} permanently?</DialogTitle>
            <DialogDescription>
              This action is permanent and cannot be undone. The instance and all its data will be
              destroyed. Type <strong className="text-foreground">{instance.name}</strong> to
              confirm.
            </DialogDescription>
          </DialogHeader>

          {actionError && <p className="text-sm text-destructive">{actionError}</p>}

          <Input
            autoFocus
            placeholder={`Type "${instance.name}" to confirm`}
            value={destroyConfirmText}
            onChange={(e) => setDestroyConfirmText(e.target.value)}
          />

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDestroyOpen(false);
                setDestroyConfirmText("");
                setActionError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={destroying || destroyConfirmText !== instance.name}
              onClick={async () => {
                setDestroying(true);
                setActionError(null);
                try {
                  await controlInstance(instanceId, "destroy");
                  setDestroyOpen(false);
                  router.push("/instances");
                } catch (err) {
                  setActionError(toUserMessage(err, "Failed to destroy instance"));
                } finally {
                  setDestroying(false);
                }
              }}
            >
              {destroying ? "Destroying..." : "Destroy permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmPull} onOpenChange={setConfirmPull}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pull Update</AlertDialogTitle>
            <AlertDialogDescription>
              This will pull the latest image and restart the bot. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={pulling} onClick={handlePullUpdate}>
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MetricCard({
  title,
  value,
  status,
  progress,
}: {
  title: string;
  value: string;
  status?: InstanceStatus;
  progress?: number;
}) {
  return (
    <Card className="py-4">
      <CardHeader className="pb-1">
        <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center gap-2">
          {status && (
            <span
              className={cn("size-2 rounded-full", {
                "bg-emerald-500 animate-[pulse-dot_2s_ease-in-out_infinite]": status === "running",
                "bg-zinc-400": status === "stopped",
                "bg-yellow-500": status === "degraded",
                "bg-red-500 animate-[pulse-dot_0.8s_ease-in-out_infinite]": status === "error",
              })}
            />
          )}
          <p className="text-2xl font-bold tracking-tight">{value}</p>
        </div>
        {progress !== undefined && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full transition-all", {
                "bg-terminal": progress < 70,
                "bg-yellow-500": progress >= 70 && progress < 90,
                "bg-red-500": progress >= 90,
              })}
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ChannelStatusBadge({ status }: { status: "connected" | "disconnected" | "error" }) {
  const config = {
    connected: {
      label: "Connected",
      className: "bg-emerald-500/15 text-emerald-500 border-emerald-500/25",
    },
    disconnected: {
      label: "Disconnected",
      className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",
    },
    error: { label: "Error", className: "bg-red-500/15 text-red-500 border-red-500/25" },
  };
  const c = config[status];
  return (
    <Badge variant="outline" className={c.className}>
      {c.label}
    </Badge>
  );
}

function formatUptime(seconds: number | null): string {
  if (seconds === null) return "--";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  if (d > 0) return `${d}d ${h}h`;
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
