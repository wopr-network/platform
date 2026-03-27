"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

const PAGE_SIZE = 50;

const DATE_RANGES = [
  { label: "Last 7 days", value: "7" },
  { label: "Last 30 days", value: "30" },
  { label: "Last 90 days", value: "90" },
  { label: "All time", value: "all" },
] as const;

const ACTION_FILTERS = [
  { label: "All", value: "all" },
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

export default function ActivityPage() {
  const [data, setData] = useState<AuditLogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [offset, setOffset] = useState(0);
  const [dateRange, setDateRange] = useState("30");
  const [actionFilter, setActionFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const requestIdRef = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(
    async (newOffset: number) => {
      setLoading(true);
      setLoadError(false);
      const reqId = ++requestIdRef.current;
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
          search: debouncedSearch?.trim() || undefined,
        });
        if (reqId !== requestIdRef.current) return;
        setData(result);
        setOffset(newOffset);
      } catch {
        if (reqId !== requestIdRef.current) return;
        setLoadError(true);
      }
      if (reqId !== requestIdRef.current) return;
      setLoading(false);
    },
    [dateRange, actionFilter, debouncedSearch],
  );

  useEffect(() => {
    load(0);
  }, [load]);

  const events = data?.events ?? [];

  if (loadError) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-3 text-muted-foreground">
        <p className="text-sm text-destructive">Failed to load activity log.</p>
        <Button variant="outline" size="sm" onClick={() => load(offset)}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Activity</h1>
        <p className="text-sm text-muted-foreground">Your account activity log</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Events</CardTitle>
              <CardDescription>
                {data ? `${data.total} total events` : "Loading..."}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-[140px]" size="sm">
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
                <SelectTrigger className="w-[120px]" size="sm">
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
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 rounded-sm border border-input bg-transparent px-3 text-sm font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {["s1", "s2", "s3", "s4", "s5"].map((id) => (
                <div key={id} className="flex gap-4">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-40" />
                </div>
              ))}
            </div>
          ) : events.length === 0 ? (
            <div className="flex h-32 items-center justify-center">
              <p className="text-sm text-muted-foreground">
                {debouncedSearch?.trim() ? "No events match your search." : "No activity yet."}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table className="min-w-[500px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px] text-xs uppercase tracking-wider font-medium text-muted-foreground">
                        Timestamp
                      </TableHead>
                      <TableHead className="w-[200px] text-xs uppercase tracking-wider font-medium text-muted-foreground">
                        Action
                      </TableHead>
                      <TableHead className="text-xs uppercase tracking-wider font-medium text-muted-foreground">
                        Resource
                      </TableHead>
                      <TableHead className="text-xs uppercase tracking-wider font-medium text-muted-foreground">
                        Details
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.map((event) => (
                      <TableRow
                        key={event.id}
                        className="hover:bg-accent/50 transition-colors duration-150"
                      >
                        <TableCell className="w-[100px]">
                          <Tooltip>
                            <TooltipTrigger className="text-xs text-muted-foreground">
                              {relativeTime(event.createdAt)}
                            </TooltipTrigger>
                            <TooltipContent>
                              {new Date(event.createdAt).toLocaleString()}
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="font-medium text-foreground">
                          {humanAction(event.action)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          <span className="text-xs uppercase tracking-wide">
                            {event.resourceType}
                          </span>{" "}
                          {event.resourceName ?? event.resourceId}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                          {event.details ?? "\u2014"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {data && data.total > PAGE_SIZE && (
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Showing {offset + 1}&ndash;
                    {Math.min(offset + PAGE_SIZE, data.total)} of {data.total}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={offset === 0}
                      onClick={() => load(Math.max(0, offset - PAGE_SIZE))}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!data.hasMore}
                      onClick={() => load(offset + PAGE_SIZE)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
