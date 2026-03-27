"use client";

import { Download, FileText, Pencil, Search, Shield, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { DeletionRequest, ExportRequest, RetentionPolicy } from "@/lib/admin-compliance-api";
import {
  cancelDeletion,
  fetchRetentionPolicies,
  getDeletionRequests,
  getExportRequests,
  triggerDeletion,
  triggerExport,
  updateRetentionPolicy,
} from "@/lib/admin-compliance-api";
import type { AuditLogResponse } from "@/lib/api";
import { fetchAuditLog } from "@/lib/api";
import { toUserMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

const STATUS_FILTERS = [
  { label: "All Statuses", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
] as const;

const AUDIT_ACTION_FILTERS = [
  { label: "All Actions", value: "all" },
  { label: "Deletion", value: "compliance.trigger_deletion" },
  { label: "Export", value: "compliance.trigger_export" },
  { label: "Policy Change", value: "compliance.policy_update" },
] as const;

const DATE_RANGES = [
  { label: "Last 24 hours", value: "1" },
  { label: "Last 7 days", value: "7" },
  { label: "Last 30 days", value: "30" },
  { label: "Last 90 days", value: "90" },
  { label: "All time", value: "all" },
] as const;

// --- Utilities ---

function relativeTime(iso: string): string {
  const rawDiff = Date.now() - new Date(iso).getTime();
  const isFuture = rawDiff < 0;
  const diff = Math.abs(rawDiff);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return isFuture ? `in ${minutes}m` : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return isFuture ? `in ${hours}h` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return isFuture ? `in ${days}d` : `${days}d ago`;
}

function isSafeUrl(url: string): boolean {
  return url.startsWith("https://") || (url.startsWith("/") && !url.startsWith("//"));
}

function statusBadgeClasses(status: string): string {
  if (status === "pending") return "bg-amber-500/15 text-amber-400 border border-amber-500/20";
  if (status === "completed") return "bg-terminal/15 text-terminal border border-terminal/20";
  if (status === "in_progress") return "bg-blue-500/15 text-blue-400 border border-blue-500/20";
  if (status === "failed") return "bg-destructive/15 text-red-400 border border-destructive/20";
  return "bg-secondary text-muted-foreground border border-border";
}

function complianceActionBadgeClasses(action: string): string {
  if (action.includes("trigger_deletion") || action.includes("complete_deletion"))
    return "bg-destructive/15 text-red-400 border border-destructive/20";
  if (action.includes("trigger_export") || action.includes("complete_export"))
    return "bg-terminal/15 text-terminal border border-terminal/20";
  if (action.includes("policy_update"))
    return "bg-amber-500/15 text-amber-400 border border-amber-500/20";
  return "bg-secondary text-muted-foreground border border-border";
}

function humanAction(action: string): string {
  return action.replace(/[._-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// --- Skeleton rows ---

const SKEL_ROWS = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"] as const;
const SKEL_COLS_4 = ["c1", "c2", "c3", "c4"] as const;
const SKEL_COLS_6 = ["c1", "c2", "c3", "c4", "c5", "c6"] as const;

function SkeletonRows({ cols, rows = 6 }: { cols: number; rows?: number }) {
  const colKeys = cols <= 4 ? SKEL_COLS_4 : SKEL_COLS_6;
  const rowKeys = SKEL_ROWS.slice(0, rows);
  return (
    <>
      {rowKeys.map((rowKey, i) => (
        <TableRow key={rowKey} className="h-10">
          {colKeys.slice(0, cols).map((colKey) => (
            <TableCell key={`${rowKey}-${colKey}`}>
              <Skeleton className="h-4 w-full" style={{ animationDelay: `${i * 50}ms` }} />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <TableRow>
      <TableCell colSpan={99} className="h-32 text-center">
        <p className="text-sm text-muted-foreground font-mono">
          &gt; {message}
          <span className="animate-ellipsis" />
        </p>
      </TableCell>
    </TableRow>
  );
}

// --- Trigger Dialog ---

function TriggerDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  confirmClassName,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  confirmClassName: string;
  onConfirm: (tenantId: string, reason: string) => Promise<void>;
}) {
  const [tenantId, setTenantId] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setTenantId("");
      setReason("");
    }
    onOpenChange(open);
  };

  const handleConfirm = async () => {
    if (!tenantId.trim() || !reason.trim()) return;
    setSubmitting(true);
    try {
      await onConfirm(tenantId.trim(), reason.trim());
      onOpenChange(false);
      setTenantId("");
      setReason("");
    } catch (err) {
      toast.error(toUserMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-base font-semibold uppercase tracking-wider">
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            placeholder="Tenant ID"
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            className="focus:border-terminal focus:ring-terminal/20"
          />
          <Textarea
            placeholder="Reason (required)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="min-h-[80px] focus:border-terminal focus:ring-terminal/20"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="outline"
            className={confirmClassName}
            onClick={handleConfirm}
            disabled={!tenantId.trim() || !reason.trim() || submitting}
          >
            {submitting ? "Processing..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Pagination ---

function Pagination({
  offset,
  total,
  hasMore,
  onNavigate,
}: {
  offset: number;
  total: number;
  hasMore: boolean;
  onNavigate: (offset: number) => void;
}) {
  if (total <= PAGE_SIZE) return null;
  return (
    <div className="flex items-center justify-between text-xs text-muted-foreground font-mono">
      <span>
        Showing {offset + 1}-{Math.min(offset + PAGE_SIZE, total)} of {total}
      </span>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" disabled={offset === 0} onClick={() => onNavigate(0)}>
          First
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={offset === 0}
          onClick={() => onNavigate(Math.max(0, offset - PAGE_SIZE))}
        >
          Previous
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!hasMore}
          onClick={() => onNavigate(offset + PAGE_SIZE)}
        >
          Next
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!hasMore}
          onClick={() => {
            const lastPageOffset = Math.floor((total - 1) / PAGE_SIZE) * PAGE_SIZE;
            onNavigate(lastPageOffset);
          }}
        >
          Last
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// TAB 1: Deletion Requests
// ============================================================

function DeletionRequestsTab() {
  const [data, setData] = useState<{
    requests: DeletionRequest[];
    total: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(
    async (newOffset: number, signal?: AbortSignal) => {
      setLoading(true);
      setLoadError(null);
      try {
        const result = await getDeletionRequests({
          status: statusFilter === "all" ? undefined : statusFilter,
          limit: PAGE_SIZE,
          offset: newOffset,
        });
        if (signal?.aborted) return;
        setData(result);
        setOffset(newOffset);
      } catch (err) {
        if (signal?.aborted) return;
        const message = err instanceof Error ? err.message : "Failed to load";
        if (message.includes("NOT_IMPLEMENTED") || message.includes("not found")) {
          setLoadError("backend_missing");
        } else {
          setLoadError(message);
        }
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [statusFilter],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(0, controller.signal);
    return () => controller.abort();
  }, [load]);

  const filteredRequests = useMemo(() => {
    if (!data) return [];
    if (!search.trim()) return data.requests;
    const q = search.toLowerCase();
    return data.requests.filter(
      (r) =>
        r.tenantId.toLowerCase().includes(q) ||
        r.requestedBy.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q),
    );
  }, [data, search]);

  const handleTriggerDeletion = async (tenantId: string, reason: string) => {
    await triggerDeletion(tenantId, reason);
    toast.success("Deletion request created");
    load(offset);
  };

  const handleCancelDeletion = async (requestId: string) => {
    try {
      await cancelDeletion(requestId);
      toast.success("Deletion request cancelled");
      load(offset);
    } catch (err) {
      toast.error(toUserMessage(err));
    }
  };

  // Backend endpoints not yet available
  if (loadError === "backend_missing") {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search requests..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 focus:border-terminal focus:ring-terminal/20"
                disabled
              />
            </div>
          </div>
          <Button
            variant="outline"
            className="border-terminal/30 text-terminal hover:bg-terminal/10"
            onClick={() => setDialogOpen(true)}
            disabled
          >
            <Trash2 className="mr-1.5 size-3.5" />
            Trigger Deletion
          </Button>
        </div>
        <div className="rounded-sm border border-terminal/10 p-8 text-center">
          <p className="text-sm text-muted-foreground font-mono">
            &gt; Backend endpoints for listing deletion requests are pending deployment
            <span className="animate-ellipsis" />
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            The admin.complianceDeletionRequests procedure is not yet available. This section will
            activate automatically once deployed.
          </p>
        </div>
        <TriggerDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          title="Trigger Data Deletion"
          description="Schedule all personal data for deletion for a specific tenant. This action is audited."
          confirmLabel="Confirm Deletion"
          confirmClassName="border-destructive/30 text-red-400 hover:bg-destructive/10"
          onConfirm={handleTriggerDeletion}
        />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-3">
        <p className="text-sm text-destructive font-mono">Failed to load deletion requests.</p>
        <Button variant="outline" size="sm" onClick={() => load(offset)}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search requests..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 focus:border-terminal focus:ring-terminal/20"
            />
          </div>
        </div>
        <Button
          variant="outline"
          className="border-terminal/30 text-terminal hover:bg-terminal/10"
          onClick={() => setDialogOpen(true)}
        >
          <Trash2 className="mr-1.5 size-3.5" />
          Trigger Deletion
        </Button>
      </div>

      <div className="rounded-sm border border-terminal/10 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary crt-scanlines">
              <TableHead className="text-xs font-medium uppercase tracking-wider w-[140px]">
                Tenant ID
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider">
                Requested By
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider">Status</TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider">
                Delete After
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider">
                Created
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider w-[80px]">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody
            className={cn("transition-opacity duration-150", loading && data && "opacity-60")}
          >
            {loading && !data ? (
              <SkeletonRows cols={6} />
            ) : filteredRequests.length === 0 && !loading ? (
              <EmptyState message="No deletion requests found" />
            ) : (
              filteredRequests.map((req) => (
                <TableRow key={req.id} className="h-10 hover:bg-secondary/50">
                  <TableCell className="font-mono text-xs w-[140px]">{req.tenantId}</TableCell>
                  <TableCell className="font-mono text-xs">{req.requestedBy}</TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium",
                        statusBadgeClasses(req.status),
                      )}
                    >
                      {req.status}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Tooltip>
                      <TooltipTrigger className="text-xs text-muted-foreground font-mono">
                        {relativeTime(req.deleteAfter)}
                      </TooltipTrigger>
                      <TooltipContent>{new Date(req.deleteAfter).toLocaleString()}</TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <Tooltip>
                      <TooltipTrigger className="text-xs text-muted-foreground font-mono">
                        {relativeTime(req.createdAt)}
                      </TooltipTrigger>
                      <TooltipContent>{new Date(req.createdAt).toLocaleString()}</TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    {req.status === "pending" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs"
                        onClick={() => handleCancelDeletion(req.id)}
                      >
                        Cancel
                      </Button>
                    ) : (
                      <span className="text-muted-foreground">{"\u2014"}</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {data && (
        <Pagination
          offset={offset}
          total={data.total}
          hasMore={offset + PAGE_SIZE < data.total}
          onNavigate={(o) => load(o)}
        />
      )}

      <TriggerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Trigger Data Deletion"
        description="Schedule all personal data for deletion for a specific tenant. This action is audited."
        confirmLabel="Confirm Deletion"
        confirmClassName="border-destructive/30 text-red-400 hover:bg-destructive/10"
        onConfirm={handleTriggerDeletion}
      />
    </div>
  );
}

// ============================================================
// TAB 2: Data Exports
// ============================================================

function DataExportsTab() {
  const [data, setData] = useState<{
    requests: ExportRequest[];
    total: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(
    async (newOffset: number, signal?: AbortSignal) => {
      setLoading(true);
      setLoadError(null);
      try {
        const result = await getExportRequests({
          status: statusFilter === "all" ? undefined : statusFilter,
          limit: PAGE_SIZE,
          offset: newOffset,
        });
        if (signal?.aborted) return;
        setData(result);
        setOffset(newOffset);
      } catch (err) {
        if (signal?.aborted) return;
        const message = err instanceof Error ? err.message : "Failed to load";
        if (message.includes("NOT_IMPLEMENTED") || message.includes("not found")) {
          setLoadError("backend_missing");
        } else {
          setLoadError(message);
        }
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [statusFilter],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(0, controller.signal);
    return () => controller.abort();
  }, [load]);

  const filteredRequests = useMemo(() => {
    if (!data) return [];
    if (!search.trim()) return data.requests;
    const q = search.toLowerCase();
    return data.requests.filter(
      (r) =>
        r.tenantId.toLowerCase().includes(q) ||
        r.requestedBy.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q),
    );
  }, [data, search]);

  const handleTriggerExport = async (tenantId: string, reason: string) => {
    await triggerExport(tenantId, reason);
    toast.success("Export request created");
    load(offset);
  };

  // Backend endpoints not yet available
  if (loadError === "backend_missing") {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search exports..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 focus:border-terminal focus:ring-terminal/20"
                disabled
              />
            </div>
          </div>
          <Button
            variant="outline"
            className="border-terminal/30 text-terminal hover:bg-terminal/10"
            onClick={() => setDialogOpen(true)}
            disabled
          >
            <Download className="mr-1.5 size-3.5" />
            Trigger Export
          </Button>
        </div>
        <div className="rounded-sm border border-terminal/10 p-8 text-center">
          <p className="text-sm text-muted-foreground font-mono">
            &gt; Backend endpoints for listing export requests are pending deployment
            <span className="animate-ellipsis" />
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            The admin.complianceExportRequests procedure is not yet available. This section will
            activate automatically once deployed.
          </p>
        </div>
        <TriggerDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          title="Trigger Data Export"
          description="Generate a GDPR Article 15 data export for a specific tenant. This action is audited."
          confirmLabel="Confirm Export"
          confirmClassName="border-terminal/30 text-terminal hover:bg-terminal/10"
          onConfirm={handleTriggerExport}
        />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-3">
        <p className="text-sm text-destructive font-mono">Failed to load export requests.</p>
        <Button variant="outline" size="sm" onClick={() => load(offset)}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search exports..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 focus:border-terminal focus:ring-terminal/20"
            />
          </div>
        </div>
        <Button
          variant="outline"
          className="border-terminal/30 text-terminal hover:bg-terminal/10"
          onClick={() => setDialogOpen(true)}
        >
          <Download className="mr-1.5 size-3.5" />
          Trigger Export
        </Button>
      </div>

      <div className="rounded-sm border border-terminal/10 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary crt-scanlines">
              <TableHead className="text-xs font-medium uppercase tracking-wider w-[140px]">
                Tenant ID
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider">
                Requested By
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider">Status</TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider">Format</TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider">
                Created
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider w-[80px]">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody
            className={cn("transition-opacity duration-150", loading && data && "opacity-60")}
          >
            {loading && !data ? (
              <SkeletonRows cols={6} />
            ) : filteredRequests.length === 0 && !loading ? (
              <EmptyState message="No export requests found" />
            ) : (
              filteredRequests.map((req) => (
                <TableRow key={req.id} className="h-10 hover:bg-secondary/50">
                  <TableCell className="font-mono text-xs w-[140px]">{req.tenantId}</TableCell>
                  <TableCell className="font-mono text-xs">{req.requestedBy}</TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium",
                        statusBadgeClasses(req.status),
                      )}
                    >
                      {req.status}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium bg-secondary text-muted-foreground border border-border">
                      {req.format.toUpperCase()}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Tooltip>
                      <TooltipTrigger className="text-xs text-muted-foreground font-mono">
                        {relativeTime(req.createdAt)}
                      </TooltipTrigger>
                      <TooltipContent>{new Date(req.createdAt).toLocaleString()}</TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    {req.status === "completed" && req.downloadUrl ? (
                      isSafeUrl(req.downloadUrl) ? (
                        <a
                          href={req.downloadUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-terminal hover:underline"
                        >
                          Download
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">Unavailable</span>
                      )
                    ) : (
                      <span className="text-muted-foreground">{"\u2014"}</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {data && (
        <Pagination
          offset={offset}
          total={data.total}
          hasMore={offset + PAGE_SIZE < data.total}
          onNavigate={(o) => load(o)}
        />
      )}

      <TriggerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Trigger Data Export"
        description="Generate a GDPR Article 15 data export for a specific tenant. This action is audited."
        confirmLabel="Confirm Export"
        confirmClassName="border-terminal/30 text-terminal hover:bg-terminal/10"
        onConfirm={handleTriggerExport}
      />
    </div>
  );
}

// ============================================================
// TAB 3: Compliance Audit Trail
// ============================================================

function ComplianceAuditTab() {
  const [data, setData] = useState<AuditLogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [offset, setOffset] = useState(0);
  const [dateRange, setDateRange] = useState("30");
  const [actionFilter, setActionFilter] = useState("all");
  const [search, setSearch] = useState("");

  const load = useCallback(
    async (newOffset: number, signal?: AbortSignal) => {
      setLoading(true);
      setLoadError(false);
      try {
        const since =
          dateRange === "all"
            ? undefined
            : new Date(Date.now() - Number(dateRange) * 86400000).toISOString();
        const result = await fetchAuditLog({
          limit: PAGE_SIZE,
          offset: newOffset,
          since,
          action: actionFilter === "all" ? "compliance" : actionFilter,
        });
        if (signal?.aborted) return;
        setData(result);
        setOffset(newOffset);
      } catch {
        if (signal?.aborted) return;
        setLoadError(true);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [dateRange, actionFilter],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(0, controller.signal);
    return () => controller.abort();
  }, [load]);

  const filteredEvents = useMemo(() => {
    if (!data) return [];
    if (!search.trim()) return data.events;
    const q = search.toLowerCase();
    return data.events.filter(
      (e) =>
        e.action.toLowerCase().includes(q) ||
        e.resourceType.toLowerCase().includes(q) ||
        (e.resourceName ?? e.resourceId).toLowerCase().includes(q) ||
        (e.details ?? "").toLowerCase().includes(q),
    );
  }, [data, search]);

  if (loadError) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-3">
        <p className="text-sm text-destructive font-mono">Failed to load compliance audit trail.</p>
        <Button variant="outline" size="sm" onClick={() => load(offset)}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search events..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 focus:border-terminal focus:ring-terminal/20"
          />
        </div>
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DATE_RANGES.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AUDIT_ACTION_FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-sm border border-terminal/10 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary crt-scanlines">
              <TableHead className="text-xs font-medium uppercase tracking-wider w-[100px]">
                Time
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider">Action</TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider">
                Resource
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider">
                Details
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody
            className={cn("transition-opacity duration-150", loading && data && "opacity-60")}
          >
            {loading && !data ? (
              <SkeletonRows cols={4} rows={8} />
            ) : filteredEvents.length === 0 && !loading ? (
              <EmptyState message="No compliance audit events found" />
            ) : (
              filteredEvents.map((event) => (
                <TableRow key={event.id} className="h-10 hover:bg-secondary/50">
                  <TableCell className="w-[100px]">
                    <Tooltip>
                      <TooltipTrigger className="text-xs text-muted-foreground font-mono">
                        {relativeTime(event.createdAt)}
                      </TooltipTrigger>
                      <TooltipContent>{new Date(event.createdAt).toLocaleString()}</TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium",
                        complianceActionBadgeClasses(event.action),
                      )}
                    >
                      {humanAction(event.action)}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                      {event.resourceType}
                    </span>{" "}
                    <span className="font-mono text-xs">
                      {event.resourceName ?? event.resourceId}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[300px] truncate">
                    {event.details ?? "\u2014"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {data && (
        <Pagination
          offset={offset}
          total={data.total}
          hasMore={data.hasMore}
          onNavigate={(o) => load(o)}
        />
      )}
    </div>
  );
}

// ============================================================
// TAB 4: Retention Policies
// ============================================================

function EditRetentionPolicyDialog({
  policy,
  open,
  onOpenChange,
  onSaved,
}: {
  policy: RetentionPolicy;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (updated: RetentionPolicy) => void;
}) {
  const [retentionDaysInput, setRetentionDaysInput] = useState(String(policy.retentionDays));
  const [autoDelete, setAutoDelete] = useState(policy.autoDelete);
  const [saving, setSaving] = useState(false);

  const retentionDaysParsed = parseInt(retentionDaysInput, 10);
  const retentionDaysValid =
    !Number.isNaN(retentionDaysParsed) && retentionDaysParsed >= 1 && retentionDaysParsed <= 3650;

  useEffect(() => {
    if (open) {
      setRetentionDaysInput(String(policy.retentionDays));
      setAutoDelete(policy.autoDelete);
    }
  }, [open, policy.retentionDays, policy.autoDelete]);

  const handleSave = async () => {
    if (!retentionDaysValid) return;
    setSaving(true);
    try {
      const updated = await updateRetentionPolicy(policy.dataType, {
        retentionDays: retentionDaysParsed,
        autoDelete,
      });
      onSaved(updated);
      onOpenChange(false);
      toast.success(`Updated retention policy for ${policy.dataType}`);
    } catch (err) {
      toast.error(toUserMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-base font-semibold uppercase tracking-wider">
            Edit Retention Policy
          </DialogTitle>
          <DialogDescription>Update retention settings for {policy.dataType}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="retentionDays">Retention period (days)</Label>
            <Input
              id="retentionDays"
              type="number"
              step={1}
              min={1}
              max={3650}
              value={retentionDaysInput}
              onChange={(e) => setRetentionDaysInput(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="autoDelete">Auto-delete</Label>
            <Switch id="autoDelete" checked={autoDelete} onCheckedChange={setAutoDelete} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !retentionDaysValid}>
            {saving ? "Saving\u2026" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RetentionPoliciesTab() {
  const [policies, setPolicies] = useState<RetentionPolicy[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<RetentionPolicy | null>(null);
  const lastEditingPolicyRef = useRef<RetentionPolicy | null>(null);
  if (editingPolicy !== null) lastEditingPolicyRef.current = editingPolicy;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    fetchRetentionPolicies()
      .then((result) => {
        if (!cancelled) setPolicies(result);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loadError) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-3">
        <p className="text-sm text-destructive font-mono">Failed to load retention policies.</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setLoading(true);
            setLoadError(false);
            fetchRetentionPolicies()
              .then(setPolicies)
              .catch(() => setLoadError(true))
              .finally(() => setLoading(false));
          }}
        >
          Retry
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {SKEL_ROWS.slice(0, 6).map((key, i) => (
          <div key={key} className="rounded-sm border border-terminal/10 bg-card p-4 space-y-3">
            <Skeleton className="h-4 w-2/3" style={{ animationDelay: `${i * 50}ms` }} />
            <Skeleton className="h-3 w-full" style={{ animationDelay: `${i * 50 + 25}ms` }} />
            <Skeleton className="h-3 w-1/2" style={{ animationDelay: `${i * 50 + 50}ms` }} />
          </div>
        ))}
      </div>
    );
  }

  if (!policies || policies.length === 0) {
    return (
      <div className="rounded-sm border border-terminal/10 p-8 text-center">
        <p className="text-sm text-muted-foreground font-mono">
          &gt; No retention policies configured
          <span className="animate-ellipsis" />
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {policies.map((policy) => (
        <div
          key={policy.dataType}
          className="rounded-sm border border-terminal/10 bg-card p-4 transition-colors duration-150 hover:border-terminal/20"
        >
          <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">
            {policy.dataType}
          </h3>
          <dl className="mt-3 space-y-1.5 text-xs font-mono text-muted-foreground">
            <div className="flex justify-between">
              <dt>Retention period</dt>
              <dd className="text-terminal font-semibold">{policy.retentionDays} days</dd>
            </div>
            <div className="flex justify-between">
              <dt>Auto-delete</dt>
              <dd>
                {policy.autoDelete ? (
                  <span className="inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium bg-terminal/15 text-terminal border border-terminal/20">
                    Enabled
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium bg-secondary text-muted-foreground border border-border">
                    Disabled
                  </span>
                )}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>Last purge</dt>
              <dd>
                {policy.lastPurge ? (
                  <Tooltip>
                    <TooltipTrigger>{relativeTime(policy.lastPurge)}</TooltipTrigger>
                    <TooltipContent>{new Date(policy.lastPurge).toLocaleString()}</TooltipContent>
                  </Tooltip>
                ) : (
                  "\u2014"
                )}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>Records affected</dt>
              <dd>{policy.recordsAffected.toLocaleString()}</dd>
            </div>
          </dl>
          <div className="mt-3 flex justify-end">
            <Button variant="outline" size="sm" onClick={() => setEditingPolicy(policy)}>
              <Pencil className="mr-1.5 size-3" />
              Edit
            </Button>
          </div>
        </div>
      ))}
      {lastEditingPolicyRef.current && (
        <EditRetentionPolicyDialog
          policy={lastEditingPolicyRef.current}
          open={editingPolicy !== null}
          onOpenChange={(open) => {
            if (!open) setEditingPolicy(null);
          }}
          onSaved={(updated) => {
            setPolicies((prev) =>
              prev ? prev.map((p) => (p.dataType === updated.dataType ? updated : p)) : prev,
            );
            setEditingPolicy(null);
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// Main Dashboard
// ============================================================

export function ComplianceDashboard() {
  const [activeTab, setActiveTab] = useState("deletions");

  return (
    <div className="space-y-3 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold uppercase tracking-wider text-terminal [text-shadow:0_0_10px_rgba(0,255,65,0.25)]">
          GDPR COMPLIANCE
        </h1>
        <span className="text-sm text-muted-foreground font-mono">
          {activeTab === "deletions" && "Deletion requests"}
          {activeTab === "exports" && "Data exports"}
          {activeTab === "audit" && "Audit trail"}
          {activeTab === "retention" && "Retention policies"}
        </span>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="deletions">
            <Trash2 className="mr-1.5 size-3.5" />
            Deletion Requests
          </TabsTrigger>
          <TabsTrigger value="exports">
            <Download className="mr-1.5 size-3.5" />
            Data Exports
          </TabsTrigger>
          <TabsTrigger value="audit">
            <FileText className="mr-1.5 size-3.5" />
            Audit Trail
          </TabsTrigger>
          <TabsTrigger value="retention">
            <Shield className="mr-1.5 size-3.5" />
            Retention Policies
          </TabsTrigger>
        </TabsList>

        <TabsContent value="deletions">
          <DeletionRequestsTab />
        </TabsContent>
        <TabsContent value="exports">
          <DataExportsTab />
        </TabsContent>
        <TabsContent value="audit">
          <ComplianceAuditTab />
        </TabsContent>
        <TabsContent value="retention">
          <RetentionPoliciesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
