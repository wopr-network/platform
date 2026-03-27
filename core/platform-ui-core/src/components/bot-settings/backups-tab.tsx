"use client";

import { Clock, Plus, RotateCw, Shield, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  createSnapshot,
  deleteSnapshot,
  listSnapshots,
  restoreSnapshot,
  type Snapshot,
} from "@/lib/api";
import { toUserMessage } from "@/lib/errors";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function snapshotLabel(snap: Snapshot): string {
  if (snap.name) return snap.name;
  return formatDate(snap.createdAt);
}

function typeBadge(snap: Snapshot): {
  label: string;
  variant: "terminal" | "secondary" | "outline";
} {
  switch (snap.type) {
    case "on-demand":
      return { label: "Manual", variant: "terminal" };
    case "nightly":
      return { label: "Nightly", variant: "secondary" };
    case "pre-restore":
      return { label: "Auto (pre-restore)", variant: "outline" };
    default:
      return { label: snap.type, variant: "outline" };
  }
}

export function BackupsTab({
  botId,
  onRestore,
}: {
  botId: string;
  onRestore?: () => void | Promise<void>;
}) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [creating, setCreating] = useState(false);

  const [restoreTarget, setRestoreTarget] = useState<Snapshot | null>(null);
  const [restoring, setRestoring] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Snapshot | null>(null);
  const [deleting, setDeleting] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const snaps = await listSnapshots(botId);
      if (mountedRef.current) setSnapshots(snaps);
    } catch (err) {
      if (mountedRef.current) setError(toUserMessage(err));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [botId]);

  const silentRefresh = useCallback(async () => {
    try {
      const snaps = await listSnapshots(botId);
      if (mountedRef.current) setSnapshots(snaps);
    } catch {
      // silently ignore — stale list is better than a flash
    }
  }, [botId]);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      setLoading(true);
      setError(null);
      try {
        const snaps = await listSnapshots(botId);
        if (!cancelled) setSnapshots(snaps);
      } catch (err) {
        if (!cancelled) setError(toUserMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [botId]);

  async function handleCreate() {
    setCreating(true);
    try {
      const result = await createSnapshot(botId, createName || undefined);
      toast.success(`Backup created (${result.estimatedMonthlyCost} storage cost)`);
      setShowCreate(false);
      setCreateName("");
      await silentRefresh();
    } catch (err) {
      toast.error(toUserMessage(err));
    } finally {
      setCreating(false);
    }
  }

  async function handleRestore() {
    if (!restoreTarget) return;
    setRestoring(true);
    try {
      await restoreSnapshot(botId, restoreTarget.id);
      await onRestore?.();
      await silentRefresh();
      setRestoreTarget(null);
      toast.success("Bot restored successfully. It may take a moment to restart.");
    } catch (err) {
      toast.error(toUserMessage(err));
    } finally {
      setRestoring(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteSnapshot(botId, deleteTarget.id);
      toast.success("Backup deleted.");
      setDeleteTarget(null);
      await silentRefresh();
    } catch (err) {
      toast.error(toUserMessage(err));
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center text-muted-foreground">
        Loading backups...
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Backups</h2>
          <p className="text-sm text-muted-foreground">
            Create checkpoints before risky changes. Restore if something breaks.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Backup
        </Button>
      </div>

      {error && (
        <div className="rounded-sm border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {error ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Button variant="outline" size="sm" onClick={() => void load()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : snapshots.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Shield className="mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm font-medium text-muted-foreground">No backups yet</p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              Create a backup before installing plugins or changing config.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {snapshots.map((snap) => {
            const badge = typeBadge(snap);
            return (
              <Card
                key={snap.id}
                className="transition-colors hover:border-primary/50 hover:bg-accent/30"
              >
                <CardContent className="flex items-center justify-between p-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{snapshotLabel(snap)}</span>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDate(snap.createdAt)}
                      </span>
                      <span>{snap.sizeMb} MB</span>
                      {snap.expiresAt && (
                        <span>
                          Expires {formatDate(new Date(snap.expiresAt * 1000).toISOString())}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setRestoreTarget(snap)}>
                      <RotateCw className="mr-1 h-3 w-3" />
                      Restore
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(snap)}>
                      <Trash2 className="h-3 w-3" />
                      <span className="sr-only">Delete</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Backup Dialog */}
      <Dialog
        open={showCreate}
        onOpenChange={(open) => {
          if (!open && !creating) {
            setShowCreate(false);
            setCreateName("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Backup</DialogTitle>
            <DialogDescription>
              Save a checkpoint of your bot's current state. You can restore it later if something
              breaks.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Backup name (optional)"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (!creating) {
                  setShowCreate(false);
                  setCreateName("");
                }
              }}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore Confirmation Dialog */}
      <Dialog
        open={restoreTarget !== null}
        onOpenChange={(open) => {
          if (!open && !restoring) setRestoreTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Are you sure?</DialogTitle>
            <DialogDescription>
              This will overwrite your bot's current state with the backup from{" "}
              <strong>{restoreTarget ? formatDate(restoreTarget.createdAt) : ""}</strong>. A
              pre-restore backup will be created automatically.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (!restoring) setRestoreTarget(null);
              }}
              disabled={restoring}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRestore} disabled={restoring}>
              {restoring ? "Restoring..." : "Confirm Restore"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete backup?</DialogTitle>
            <DialogDescription>
              This will permanently delete the backup
              {deleteTarget?.name ? ` "${deleteTarget.name}"` : ""} from{" "}
              {deleteTarget ? formatDate(deleteTarget.createdAt) : ""}. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (!deleting) setDeleteTarget(null);
              }}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Confirm Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
