"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AuditLogResponse } from "@/lib/api";
import { fetchAuditLog } from "@/lib/api";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

const DATE_RANGES = [
  { label: "Last 24 hours", value: "1" },
  { label: "Last 7 days", value: "7" },
  { label: "Last 30 days", value: "30" },
  { label: "Last 90 days", value: "90" },
  { label: "All time", value: "all" },
] as const;

const ACTION_FILTERS = [
  { label: "All Actions", value: "all" },
  { label: "Admin", value: "admin" },
  { label: "Bots", value: "bot" },
  { label: "Billing", value: "billing" },
  { label: "Security", value: "security" },
  { label: "Org", value: "org" },
  { label: "API Keys", value: "api_key" },
] as const;

function humanAction(action: string): string {
  return action.replace(/[._-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function actionBadgeClasses(action: string): string {
  if (action.startsWith("admin.suspend") || action.startsWith("admin.ban"))
    return "bg-destructive/15 text-red-400 border border-destructive/20";
  if (action.startsWith("admin.reactivate"))
    return "bg-terminal/15 text-terminal border border-terminal/20";
  if (action.startsWith("billing")) return "bg-chart-3/15 text-amber-400 border border-chart-3/20";
  if (action.startsWith("security"))
    return "bg-destructive/15 text-red-400 border border-destructive/20";
  return "bg-secondary text-muted-foreground border border-border";
}

export function AuditLogTable() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [data, setData] = useState<AuditLogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const initialPage = (() => {
    const raw = searchParams.get("page");
    return raw ? Math.max(1, parseInt(raw, 10) || 1) : 1;
  })();
  const [offset, setOffset] = useState((initialPage - 1) * PAGE_SIZE);
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
          action: actionFilter === "all" ? undefined : actionFilter,
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

  // Sync offset to URL
  useEffect(() => {
    const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
    const params = new URLSearchParams(searchParams.toString());
    const urlPage = params.get("page");
    const urlPageNum = urlPage ? parseInt(urlPage, 10) : 1;
    if (urlPageNum === currentPage) return;
    if (currentPage <= 1) {
      params.delete("page");
    } else {
      params.set("page", String(currentPage));
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [offset, router, pathname, searchParams]);

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
        <p className="text-sm text-destructive font-mono">Failed to load audit log.</p>
        <Button variant="outline" size="sm" onClick={() => load(offset)}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold uppercase tracking-wider text-terminal [text-shadow:0_0_10px_rgba(0,255,65,0.25)]">
          AUDIT LOG
        </h1>
        <span className="text-sm text-muted-foreground font-mono">
          {data ? `${data.total} events` : "Loading..."}
        </span>
      </div>

      {/* Filters */}
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
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACTION_FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-sm border border-terminal/10">
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
              ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"].map((rowKey, i) => (
                <TableRow key={rowKey} className="h-10">
                  {["time", "action", "resource", "details"].map((col) => (
                    <TableCell key={`${rowKey}-${col}`}>
                      <Skeleton className="h-4 w-full" style={{ animationDelay: `${i * 50}ms` }} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : filteredEvents.length === 0 && !loading ? (
              <TableRow>
                <TableCell colSpan={4} className="h-32 text-center">
                  <p className="text-sm text-muted-foreground font-mono">
                    &gt; No audit events found
                    <span className="animate-ellipsis" />
                  </p>
                </TableCell>
              </TableRow>
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
                        actionBadgeClasses(event.action),
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

      {/* Pagination */}
      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-xs text-muted-foreground font-mono">
          <span>
            Showing {offset + 1}-{Math.min(offset + PAGE_SIZE, data.total)} of {data.total}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="xs" disabled={offset === 0} onClick={() => load(0)}>
              First
            </Button>
            <Button
              variant="ghost"
              size="xs"
              disabled={offset === 0}
              onClick={() => load(Math.max(0, offset - PAGE_SIZE))}
            >
              Previous
            </Button>
            <Button
              variant="ghost"
              size="xs"
              disabled={!data.hasMore}
              onClick={() => load(offset + PAGE_SIZE)}
            >
              Next
            </Button>
            <Button
              variant="ghost"
              size="xs"
              disabled={!data.hasMore}
              onClick={() => {
                const lastPageOffset = Math.floor((data.total - 1) / PAGE_SIZE) * PAGE_SIZE;
                load(lastPageOffset);
              }}
            >
              Last
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
