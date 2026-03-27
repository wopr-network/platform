"use client";

import { AlertTriangleIcon, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { LogEntry, LogLevel } from "@/lib/api";
import { getInstanceLogs } from "@/lib/api";
import { cn } from "@/lib/utils";

const levelColors: Record<LogLevel, string> = {
  debug: "text-zinc-500",
  info: "text-blue-400",
  warn: "text-yellow-400",
  error: "text-red-400",
};

const levelBgColors: Record<LogLevel, string> = {
  debug: "bg-zinc-500/10",
  info: "bg-blue-500/10",
  warn: "bg-yellow-500/10",
  error: "bg-red-500/10",
};

export function LogsViewer({ instanceId }: { instanceId: string }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [levelFilter, setLevelFilter] = useState<LogLevel | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: { level?: LogLevel; source?: string; search?: string } = {};
      if (levelFilter !== "all") params.level = levelFilter;
      if (sourceFilter !== "all") params.source = sourceFilter;
      if (debouncedSearch) params.search = debouncedSearch;

      const data = await getInstanceLogs(instanceId, params);
      setLogs(data);
      requestAnimationFrame(() => {
        if (autoScroll && scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      });
    } catch {
      setError("Failed to load logs — please try again.");
    } finally {
      setLoading(false);
    }
  }, [instanceId, autoScroll, levelFilter, sourceFilter, debouncedSearch]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5_000);
    return () => clearInterval(interval);
  }, [load]);

  const sources = [...new Set(logs.map((l) => l.source))];

  const filtered = logs;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={levelFilter} onValueChange={(v) => setLevelFilter(v as LogLevel | "all")}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            <SelectItem value="debug">Debug</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warn">Warn</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            {sources.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative max-w-[250px] sm:max-w-full">
          <Input
            placeholder="Search logs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full"
          />
          {search !== debouncedSearch && (
            <span className="absolute right-3 top-1/2 size-2 -translate-y-1/2 rounded-full bg-emerald-500/60 animate-pulse" />
          )}
        </div>

        <Button
          variant={autoScroll ? "terminal" : "outline"}
          size="sm"
          onClick={() => setAutoScroll(!autoScroll)}
        >
          {autoScroll ? "Auto-scroll ON" : "Auto-scroll OFF"}
        </Button>
      </div>

      {/* Error Banner */}
      {error && logs.length === 0 && (
        <div className="flex items-center gap-3 rounded-sm border border-destructive/30 bg-destructive/5 px-4 py-3">
          <AlertTriangleIcon className="size-5 shrink-0 text-destructive" />
          <p className="flex-1 text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="size-4" />
            Retry
          </Button>
        </div>
      )}

      {/* Log Stream */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            Real-time Logs{" "}
            <span className="font-normal text-muted-foreground">({filtered.length} entries)</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading && logs.length === 0 ? (
            <div className="h-[400px] space-y-2 rounded-md bg-zinc-950 p-4">
              {Array.from({ length: 12 }, (_, n) => `sk-${n}`).map((skId, i) => (
                <Skeleton
                  key={skId}
                  className="h-4 bg-zinc-800"
                  style={{ width: `${60 + ((i * 17) % 40)}%` }}
                />
              ))}
            </div>
          ) : (
            <div
              ref={scrollRef}
              className={cn(
                "h-[400px] overflow-auto rounded-md bg-zinc-950 p-4 font-mono text-xs",
                loading && logs.length > 0 && "opacity-50 transition-opacity duration-150",
              )}
            >
              {filtered.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center">
                  <p className="text-zinc-500">No logs match the current filters.</p>
                  <p className="mt-1 text-zinc-600">
                    Try broadening your search or changing the level filter.
                  </p>
                </div>
              ) : (
                filtered.map((log) => (
                  <div
                    key={log.id}
                    className={cn(
                      "flex gap-3 rounded px-2 py-1 hover:bg-zinc-900",
                      levelBgColors[log.level],
                    )}
                  >
                    <span className="shrink-0 text-zinc-600">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span
                      className={cn("w-12 shrink-0 text-right uppercase", levelColors[log.level])}
                    >
                      {log.level}
                    </span>
                    <span className="shrink-0 text-zinc-500">[{log.source}]</span>
                    <span className="text-zinc-300">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
