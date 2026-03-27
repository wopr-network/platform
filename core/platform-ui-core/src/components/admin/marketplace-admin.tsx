"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, GripVertical, Package, Plus, Scan, Star, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
import { Textarea } from "@/components/ui/textarea";
import {
  type AdminPlugin,
  addPluginByNpm,
  deletePlugin,
  getDiscoveryQueue,
  getEnabledPlugins,
  getInstallStatus,
  type InstallStatus,
  reorderPlugins,
  triggerDiscovery,
  updatePlugin,
} from "@/lib/admin-marketplace-api";
import { toUserMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

// ---- Category badge styling ----

function categoryBadgeClass(category: string): string {
  switch (category) {
    case "superpower":
      return "border-amber-500/30 text-amber-400";
    case "channel":
      return "border-terminal/30 text-terminal";
    default:
      return "border-border text-muted-foreground";
  }
}

// ---- Main component ----

export function MarketplaceAdmin() {
  const [queue, setQueue] = useState<AdminPlugin[]>([]);
  const [enabled, setEnabled] = useState<AdminPlugin[]>([]);
  const [selected, setSelected] = useState<AdminPlugin | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addPackage, setAddPackage] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [notes, setNotes] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [installStatus, setInstallStatus] = useState<InstallStatus | null>(null);
  const [installStatusLoading, setInstallStatusLoading] = useState(false);
  const notesTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const dragItemRef = useRef<number | null>(null);
  const dragOverRef = useRef<number | null>(null);
  const installPollRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [q, e] = await Promise.all([getDiscoveryQueue(), getEnabledPlugins()]);
      setQueue(q);
      setEnabled(e);
    } catch {
      setLoadError("Failed to load marketplace data. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Sync notes when selected plugin changes
  useEffect(() => {
    setNotes(selected?.notes ?? "");
  }, [selected?.notes]);

  // Reset delete dialog when selected plugin changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: selected drives the reset; setDeleteOpen is stable
  useEffect(() => {
    setDeleteOpen(false);
  }, [selected]);

  // ---- Install status polling ----

  const startInstallStatusPoll = useCallback((id: string) => {
    if (installPollRef.current) clearInterval(installPollRef.current);
    setInstallStatusLoading(true);
    let errorCount = 0;

    const poll = async () => {
      try {
        const status = await getInstallStatus(id);
        setInstallStatus(status);
        setInstallStatusLoading(false);
        errorCount = 0;
        if (status.status !== "pending" && installPollRef.current) {
          clearInterval(installPollRef.current);
          installPollRef.current = undefined;
        }
      } catch {
        setInstallStatusLoading(false);
        errorCount++;
        if (errorCount >= 3 && installPollRef.current) {
          clearInterval(installPollRef.current);
          installPollRef.current = undefined;
        }
      }
    };

    poll();
    installPollRef.current = setInterval(poll, 3000);
  }, []);

  useEffect(() => {
    if (installPollRef.current) {
      clearInterval(installPollRef.current);
      installPollRef.current = undefined;
    }
    setInstallStatus(null);
    if (selected) {
      startInstallStatusPoll(selected.id);
    }
    return () => {
      if (installPollRef.current) {
        clearInterval(installPollRef.current);
        installPollRef.current = undefined;
      }
    };
  }, [selected, startInstallStatusPoll]);

  // ---- Handlers ----

  const handleToggle = async (plugin: AdminPlugin, field: "enabled" | "featured") => {
    try {
      const updated = await updatePlugin({ id: plugin.id, [field]: !plugin[field] });
      if (selected?.id === plugin.id) setSelected(updated);
      await load();
    } catch (err) {
      toast.error(`Failed to update plugin: ${toUserMessage(err)}`);
    }
  };

  const handleReview = async (plugin: AdminPlugin, enable: boolean) => {
    try {
      await updatePlugin({
        id: plugin.id,
        reviewed: true,
        enabled: enable,
      });
      if (selected?.id === plugin.id) setSelected(null);
      await load();
    } catch (err) {
      toast.error(`Failed to review plugin: ${toUserMessage(err)}`);
    }
  };

  const handleNotesChange = (value: string) => {
    setNotes(value);
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
    notesTimerRef.current = setTimeout(async () => {
      if (selected) {
        try {
          const updated = await updatePlugin({ id: selected.id, notes: value });
          setSelected(updated);
        } catch {
          // Silently ignore autosave failures
        }
      }
    }, 800);
  };

  const handleAdd = async () => {
    if (!addPackage.trim()) return;
    setAddLoading(true);
    try {
      await addPluginByNpm({ npm_package: addPackage.trim() });
      setAddPackage("");
      setAddOpen(false);
      await load();
    } catch (err) {
      toast.error(`Failed to add plugin: ${toUserMessage(err)}`);
    } finally {
      setAddLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    setDeleteLoading(true);
    try {
      await deletePlugin(selected.id);
      setSelected(null);
      setDeleteOpen(false);
      await load();
      toast.success("Plugin deleted.");
    } catch (err) {
      toast.error(`Failed to delete plugin: ${toUserMessage(err)}`);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleScan = async () => {
    setScanLoading(true);
    try {
      const result = await triggerDiscovery();
      toast.success(
        `Discovered ${result.discovered} new plugin${result.discovered !== 1 ? "s" : ""}, ${result.alreadyKnown} already known.`,
      );
      if (result.discovered > 0) {
        await load();
      }
    } catch (err) {
      toast.error(`Discovery failed: ${toUserMessage(err)}`);
    } finally {
      setScanLoading(false);
    }
  };

  const handleCategoryChange = async (category: string) => {
    if (!selected) return;
    try {
      const updated = await updatePlugin({ id: selected.id, category });
      setSelected(updated);
      await load();
    } catch (err) {
      toast.error(`Failed to update category: ${toUserMessage(err)}`);
    }
  };

  // ---- DnD handlers ----

  const handleDragStart = (index: number) => {
    dragItemRef.current = index;
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    dragOverRef.current = index;
  };

  const handleDrop = async () => {
    const from = dragItemRef.current;
    const to = dragOverRef.current;
    if (from === null || to === null || from === to) return;

    const reordered = [...enabled];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    setEnabled(reordered);

    try {
      await reorderPlugins(reordered.map((p) => p.id));
    } catch {
      // Reorder API failure is non-critical; visual order already updated
    }
    dragItemRef.current = null;
    dragOverRef.current = null;
  };

  // ---- Skeleton ----

  if (loadError) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-3">
        <p className="text-sm text-destructive font-mono">{loadError}</p>
        <Button variant="outline" size="sm" onClick={load}>
          Retry
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full">
        <div className="flex-1 p-6 space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
        <div className="w-96 shrink-0 border-l border-border p-6 space-y-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-1 min-h-0">
        {/* ---- Left Panel ---- */}
        <div className="flex-1 overflow-auto border-r border-border p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold uppercase tracking-wider [text-shadow:0_0_10px_rgba(0,255,65,0.25)]">
              Marketplace Curation
            </h1>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                className="border border-border hover:bg-secondary"
                onClick={handleScan}
                disabled={scanLoading}
              >
                <Scan className="size-4 mr-1.5" />
                {scanLoading ? "Scanning..." : "Scan npm"}
              </Button>
              <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="ghost"
                    className="bg-terminal/10 text-terminal border border-terminal/30 hover:bg-terminal/20"
                  >
                    <Plus className="size-4 mr-1.5" />
                    Add Plugin
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Plugin by npm Package</DialogTitle>
                    <DialogDescription>
                      Paste the npm package name to add it to the discovery queue.
                    </DialogDescription>
                  </DialogHeader>
                  <Input
                    className="font-mono"
                    placeholder="@org/plugin-name"
                    value={addPackage}
                    onChange={(e) => setAddPackage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAdd();
                    }}
                  />
                  <DialogFooter>
                    <Button variant="ghost" onClick={() => setAddOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      variant="ghost"
                      className="bg-terminal/10 text-terminal border border-terminal/30 hover:bg-terminal/20"
                      onClick={handleAdd}
                      disabled={addLoading || !addPackage.trim()}
                    >
                      {addLoading ? "Adding..." : "Add"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Discovery Queue */}
          {queue.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                  Discovery Queue
                </h2>
                <Badge
                  variant="secondary"
                  className="bg-amber-500/15 text-amber-400 border border-amber-500/20 text-xs"
                >
                  {queue.length}
                </Badge>
              </div>
              <div className="border border-amber-500/20 rounded-sm">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-amber-500/5 hover:bg-amber-500/5">
                      <TableHead className="text-xs uppercase tracking-wider">Package</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider">Category</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider text-right">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {queue.map((plugin) => (
                      <TableRow
                        key={plugin.id}
                        className={cn(
                          "cursor-pointer hover:bg-secondary/50",
                          selected?.id === plugin.id && "bg-terminal/5",
                        )}
                        onClick={() => setSelected(plugin)}
                      >
                        <TableCell>
                          <div>
                            <div className="text-sm font-medium">{plugin.name}</div>
                            <div className="text-xs text-muted-foreground font-mono">
                              {plugin.npm_package}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn("text-xs", categoryBadgeClass(plugin.category))}
                          >
                            {plugin.category}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-terminal hover:bg-terminal/10 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleReview(plugin, true);
                              }}
                            >
                              Enable
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-muted-foreground hover:bg-secondary text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleReview(plugin, false);
                              }}
                            >
                              Ignore
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Enabled Plugins */}
          <div className="space-y-2">
            <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Enabled Plugins
            </h2>
            <div className="border border-terminal/10 rounded-sm">
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary hover:bg-secondary">
                    <TableHead className="w-8" />
                    <TableHead className="text-xs uppercase tracking-wider">Name</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">Category</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">Featured</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">Version</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">Enabled</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {enabled.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8">
                        <span className="text-sm text-muted-foreground font-mono">
                          &gt; No plugins enabled yet
                        </span>
                      </TableCell>
                    </TableRow>
                  ) : (
                    enabled.map((plugin, index) => (
                      <TableRow
                        key={plugin.id}
                        draggable
                        onDragStart={() => handleDragStart(index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDrop={handleDrop}
                        className={cn(
                          "h-10 cursor-pointer hover:bg-secondary/50",
                          selected?.id === plugin.id && "bg-terminal/5",
                        )}
                        onClick={() => setSelected(plugin)}
                      >
                        <TableCell className="w-8">
                          <GripVertical className="size-4 text-muted-foreground cursor-grab" />
                        </TableCell>
                        <TableCell>
                          <div className="text-sm font-medium">{plugin.name}</div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn("text-xs", categoryBadgeClass(plugin.category))}
                          >
                            {plugin.category}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={plugin.featured}
                            className="data-[state=checked]:bg-amber-500"
                            onClick={(e) => e.stopPropagation()}
                            onCheckedChange={() => handleToggle(plugin, "featured")}
                          />
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground font-mono">
                            v{plugin.version}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={plugin.enabled}
                            className="data-[state=checked]:bg-terminal"
                            onClick={(e) => e.stopPropagation()}
                            onCheckedChange={() => handleToggle(plugin, "enabled")}
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        {/* ---- Right Panel (Detail) ---- */}
        <div className="w-96 shrink-0 overflow-auto p-6 space-y-4">
          <AnimatePresence mode="wait">
            {selected ? (
              <motion.div
                key={selected.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="space-y-4"
              >
                {/* Header */}
                <div>
                  <h2 className="text-lg font-bold">{selected.name}</h2>
                  <p className="text-xs text-muted-foreground font-mono">{selected.npm_package}</p>
                  <p className="text-sm text-muted-foreground mt-1">{selected.description}</p>
                </div>

                {/* Metadata */}
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground items-center">
                  <span className="font-mono">v{selected.version}</span>
                  <span>by {selected.author}</span>
                  <select
                    className={cn(
                      "text-xs border rounded-sm px-1.5 py-0.5 bg-transparent cursor-pointer",
                      categoryBadgeClass(selected.category),
                      "border-current",
                    )}
                    value={selected.category}
                    onChange={(e) => handleCategoryChange(e.target.value)}
                  >
                    {["superpower", "channel", "utility", "integration", "other"].map((cat) => (
                      <option key={cat} value={cat} className="bg-background text-foreground">
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Install status */}
                {!installStatusLoading && installStatus && (
                  <div className="flex items-center gap-2">
                    {installStatus.status === "pending" && (
                      <Badge
                        variant="outline"
                        className="border-amber-500/30 text-amber-400 text-xs animate-pulse"
                      >
                        Installing...
                      </Badge>
                    )}
                    {installStatus.status === "installed" && (
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className="border-terminal/30 text-terminal text-xs"
                        >
                          Installed
                        </Badge>
                        {installStatus.installedAt && (
                          <span className="text-xs text-muted-foreground">
                            {new Date(installStatus.installedAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    )}
                    {installStatus.status === "failed" && (
                      <div className="space-y-1">
                        <Badge
                          variant="outline"
                          className="border-destructive/50 text-destructive text-xs"
                        >
                          Install failed
                        </Badge>
                        {installStatus.installError && (
                          <p className="text-xs text-destructive font-mono">
                            {installStatus.installError}
                          </p>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-6 px-2"
                          onClick={() => startInstallStatusPoll(selected.id)}
                        >
                          Retry
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* SUPERPOWER.md Preview */}
                {selected.superpower_md && (
                  <div className="space-y-1.5">
                    <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      SUPERPOWER.MD Preview
                    </h3>
                    <div className="rounded-sm border border-border bg-secondary/50 p-3 max-h-64 overflow-auto">
                      <pre className="whitespace-pre-wrap text-xs font-mono leading-relaxed">
                        {selected.superpower_md}
                      </pre>
                    </div>
                  </div>
                )}

                {/* Toggles */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Enabled</span>
                    <Switch
                      checked={selected.enabled}
                      className="data-[state=checked]:bg-terminal"
                      onCheckedChange={() => handleToggle(selected, "enabled")}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm flex items-center gap-1.5">
                      <Star className="size-3.5" />
                      Featured
                    </span>
                    <Switch
                      checked={selected.featured}
                      className="data-[state=checked]:bg-amber-500"
                      onCheckedChange={() => handleToggle(selected, "featured")}
                    />
                  </div>
                </div>

                {/* Notes */}
                <div className="space-y-1.5">
                  <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Internal Notes
                  </h3>
                  <Textarea
                    className="min-h-[80px] text-sm bg-black/30 border-border focus:border-terminal"
                    placeholder="Add internal notes about this plugin..."
                    value={notes}
                    onChange={(e) => handleNotesChange(e.target.value)}
                  />
                </div>

                {/* npm link */}
                <a
                  href={`https://www.npmjs.com/package/${selected.npm_package}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-terminal hover:underline"
                >
                  <Package className="size-3.5" />
                  View on npm
                  <ExternalLink className="size-3" />
                </a>

                {/* Delete button — disabled plugins only */}
                {!selected.enabled && (
                  <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                    <DialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 border border-destructive/30 w-full mt-2"
                      >
                        <Trash2 className="size-3.5 mr-1.5" />
                        Delete Plugin
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Delete Plugin</DialogTitle>
                        <DialogDescription>
                          Are you sure you want to delete <strong>{selected.name}</strong>? This
                          action cannot be undone.
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter>
                        <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
                          Cancel
                        </Button>
                        <Button
                          variant="ghost"
                          className="bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive/20"
                          onClick={handleDelete}
                          disabled={deleteLoading}
                        >
                          {deleteLoading ? "Deleting..." : "Delete"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center justify-center h-full"
              >
                <span className="text-sm text-muted-foreground font-mono">
                  &gt; Select a plugin to preview
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
