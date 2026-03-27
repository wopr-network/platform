"use client";

import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Database,
  History,
  Loader2,
  RotateCcw,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { MigrationRecord, MigrationRestoreRecord, MigrationSnapshot } from "@/lib/admin-api";
import {
  getMigrationRestoreHistory,
  getMigrationSnapshots,
  getMigrations,
  restoreMigrationSnapshot,
} from "@/lib/admin-api";
import { toUserMessage } from "@/lib/errors";

// ---- Utilities ----

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function fmtDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ---- Status badge ----

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return (
        <Badge
          variant="secondary"
          className="bg-green-500/15 text-green-400 border-green-500/20 inline-flex items-center gap-1"
        >
          <CheckCircle2 className="h-3 w-3" />
          completed
        </Badge>
      );
    case "running":
      return (
        <Badge
          variant="secondary"
          className="bg-blue-500/15 text-blue-400 border-blue-500/20 inline-flex items-center gap-1"
        >
          <Loader2 className="h-3 w-3 animate-spin" />
          running
        </Badge>
      );
    case "failed":
      return (
        <Badge
          variant="secondary"
          className="bg-red-500/15 text-red-400 border-red-500/20 inline-flex items-center gap-1"
        >
          <AlertCircle className="h-3 w-3" />
          failed
        </Badge>
      );
    default:
      return (
        <Badge
          variant="secondary"
          className="bg-muted text-muted-foreground inline-flex items-center gap-1"
        >
          <Clock className="h-3 w-3" />
          pending
        </Badge>
      );
  }
}

// ---- Migrations list ----

function MigrationsList({ migrations }: { migrations: MigrationRecord[] }) {
  return (
    <div className="rounded-md border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead>Migration</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Applied At</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Error</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {migrations.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8 text-sm">
                No migrations found.
              </TableCell>
            </TableRow>
          ) : (
            migrations.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  <code className="text-xs">{m.name}</code>
                </TableCell>
                <TableCell>
                  <StatusBadge status={m.status} />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {m.applied_at ? new Date(m.applied_at).toLocaleString() : "—"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground tabular-nums">
                  {fmtDuration(m.duration_ms)}
                </TableCell>
                <TableCell className="text-xs text-red-400 max-w-xs truncate">
                  {m.error ?? "—"}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

// ---- Snapshot browser ----

interface SnapshotBrowserProps {
  tenantId: string;
}

function SnapshotBrowser({ tenantId }: SnapshotBrowserProps) {
  const [snapshots, setSnapshots] = useState<MigrationSnapshot[]>([]);
  const [history, setHistory] = useState<MigrationRestoreRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [snaps, hist] = await Promise.all([
        getMigrationSnapshots(tenantId),
        getMigrationRestoreHistory(tenantId),
      ]);
      setSnapshots(snaps);
      setHistory(hist);
    } catch (err) {
      toast.error(toUserMessage(err));
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRestore(snapshotId: string, snapshotName: string) {
    if (
      !confirm(`Restore snapshot "${snapshotName}" for tenant ${tenantId}? This cannot be undone.`)
    )
      return;
    setRestoring(snapshotId);
    try {
      await restoreMigrationSnapshot(tenantId, snapshotId);
      toast.success("Restore initiated. Check restore history for status.");
      await load();
    } catch (err) {
      toast.error(toUserMessage(err));
    } finally {
      setRestoring(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }, (_, i) => `sk-snap-${i}`).map((k) => (
          <Skeleton key={k} className="h-12 rounded-md" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Database className="h-4 w-4 text-muted-foreground" />
          Snapshots
        </h3>
        <div className="rounded-md border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>Name</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Created</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {snapshots.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8 text-sm">
                    No snapshots for this tenant.
                  </TableCell>
                </TableRow>
              ) : (
                snapshots.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium text-sm">{s.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground tabular-nums">
                      {fmtBytes(s.size_bytes)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(s.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRestore(s.id, s.name)}
                        disabled={restoring === s.id}
                        className="h-7 text-xs"
                      >
                        {restoring === s.id ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <RotateCcw className="h-3 w-3 mr-1" />
                        )}
                        Restore
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          Restore History
        </h3>
        <div className="rounded-md border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>Snapshot</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Restored By</TableHead>
                <TableHead>Restored At</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-6 text-sm">
                    No restore history.
                  </TableCell>
                </TableRow>
              ) : (
                history.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm">{r.snapshot_name}</TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.restored_by}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(r.restored_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs text-red-400 max-w-xs truncate">
                      {r.error ?? "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

// ---- Main dashboard ----

export function MigrationsDashboard() {
  const [migrations, setMigrations] = useState<MigrationRecord[]>([]);
  const [migsLoading, setMigsLoading] = useState(true);
  const [tenantId, setTenantId] = useState("");
  const [tenantQuery, setTenantQuery] = useState("");

  const loadMigrations = useCallback(async () => {
    setMigsLoading(true);
    try {
      const result = await getMigrations();
      setMigrations(result);
    } catch (err) {
      toast.error(toUserMessage(err));
    } finally {
      setMigsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMigrations();
  }, [loadMigrations]);

  function handleTenantSearch() {
    setTenantId(tenantQuery.trim());
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Migrations</h1>
        <p className="text-muted-foreground text-sm">
          Platform migration status and per-tenant snapshot management
        </p>
      </div>

      <Tabs defaultValue="migrations">
        <TabsList>
          <TabsTrigger value="migrations">Platform Migrations</TabsTrigger>
          <TabsTrigger value="snapshots">Tenant Snapshots</TabsTrigger>
        </TabsList>

        <TabsContent value="migrations" className="mt-4">
          <div className="flex justify-end mb-3">
            <Button size="sm" variant="outline" onClick={loadMigrations}>
              Refresh
            </Button>
          </div>
          {migsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }, (_, i) => `sk-mig-${i}`).map((k) => (
                <Skeleton key={k} className="h-12 rounded-md" />
              ))}
            </div>
          ) : (
            <MigrationsList migrations={migrations} />
          )}
        </TabsContent>

        <TabsContent value="snapshots" className="mt-4">
          <div className="flex gap-2 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Enter tenant ID…"
                value={tenantQuery}
                onChange={(e) => setTenantQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleTenantSearch()}
                className="pl-8 h-8 text-sm"
              />
            </div>
            <Button size="sm" onClick={handleTenantSearch} disabled={!tenantQuery.trim()}>
              Load
            </Button>
          </div>
          {tenantId ? (
            <SnapshotBrowser tenantId={tenantId} />
          ) : (
            <div className="rounded-lg border border-border border-dashed py-16 text-center">
              <Database className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Enter a tenant ID to browse snapshots.
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
