"use client";

import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CreditDetailed } from "@/components/ui/credit-detailed";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { HostedCapability, HostedUsageEvent } from "@/lib/api";
import { getHostedUsageEvents } from "@/lib/api";
import { formatCreditDetailed, formatCreditStandard } from "@/lib/format-credit";

const CAPABILITY_LABELS: Record<HostedCapability, string> = {
  transcription: "Transcription",
  image_gen: "Image Generation",
  text_gen: "Text Generation",
  embeddings: "Embeddings",
};

type SortField = "date" | "capability" | "provider" | "units" | "cost";
type SortDir = "asc" | "desc";

export default function HostedUsageDetailPage() {
  const [events, setEvents] = useState<HostedUsageEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [capabilityFilter, setCapabilityFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [error, setError] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toLocaleDateString("en-CA");
  });
  const [dateTo, setDateTo] = useState<string>(() => new Date().toLocaleDateString("en-CA"));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getHostedUsageEvents({
        from: dateFrom || undefined,
        to: dateTo || undefined,
      });
      setEvents(data);
    } catch {
      setError("Failed to load usage events.");
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredEvents = useMemo(() => {
    let result = events;
    if (capabilityFilter !== "all") {
      result = result.filter((e) => e.capability === capabilityFilter);
    }
    result = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "date":
          cmp = a.date.localeCompare(b.date);
          break;
        case "capability":
          cmp = a.capability.localeCompare(b.capability);
          break;
        case "provider":
          cmp = a.provider.localeCompare(b.provider);
          break;
        case "units":
          cmp = a.units - b.units;
          break;
        case "cost":
          cmp = a.cost - b.cost;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return result;
  }, [events, capabilityFilter, sortField, sortDir]);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  function handleExportCsv() {
    const header = "Date,Capability,Provider,Units,Unit,Cost\n";
    const rows = filteredEvents
      .map(
        (e) =>
          `${e.date},${CAPABILITY_LABELS[e.capability] ?? e.capability},${e.provider},${e.units},${e.unitLabel},${formatCreditDetailed(e.cost).slice(1)}`,
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hosted-usage.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return null;
    return sortDir === "asc" ? (
      <ChevronUpIcon className="inline size-3.5 ml-0.5" />
    ) : (
      <ChevronDownIcon className="inline size-3.5 ml-0.5" />
    );
  }

  if (loading) {
    return (
      <div className="max-w-4xl space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="rounded-sm border p-6 space-y-4">
          <div className="flex justify-between">
            <Skeleton className="h-5 w-32" />
            <div className="flex gap-2">
              <Skeleton className="h-9 w-36" />
              <Skeleton className="h-9 w-24" />
            </div>
          </div>
          {["sk-a", "sk-b", "sk-c", "sk-d", "sk-e"].map((skId) => (
            <div key={skId} className="flex justify-between py-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-16 text-right" />
              <Skeleton className="h-4 w-16 text-right" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-3 text-muted-foreground">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={load}>
          Retry
        </Button>
      </div>
    );
  }

  const totalCost = filteredEvents.reduce((sum, e) => sum + e.cost, 0);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Hosted Usage Detail</h1>
        <p className="text-sm text-muted-foreground">Per-event breakdown of your hosted AI usage</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle>Usage Events</CardTitle>
              <CardDescription>
                {filteredEvents.length} event{filteredEvents.length !== 1 ? "s" : ""} — Total:{" "}
                {formatCreditStandard(totalCost)}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="date-from" className="text-xs text-muted-foreground">
                  From
                </Label>
                <Input
                  id="date-from"
                  type="date"
                  aria-label="From date"
                  value={dateFrom}
                  max={dateTo}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="h-9 w-36"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <Label htmlFor="date-to" className="text-xs text-muted-foreground">
                  To
                </Label>
                <Input
                  id="date-to"
                  type="date"
                  aria-label="To date"
                  value={dateTo}
                  min={dateFrom}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="h-9 w-36"
                />
              </div>
              <Select value={capabilityFilter} onValueChange={setCapabilityFilter}>
                <SelectTrigger aria-label="Filter by capability">
                  <SelectValue placeholder="All capabilities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All capabilities</SelectItem>
                  {(Object.entries(CAPABILITY_LABELS) as [HostedCapability, string][]).map(
                    ([cap, label]) => (
                      <SelectItem key={cap} value={cap}>
                        {label}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={handleExportCsv}>
                Export CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No usage events found.</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto p-0 font-medium"
                        onClick={() => handleSort("date")}
                      >
                        Date
                        <SortIcon field="date" />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto p-0 font-medium"
                        onClick={() => handleSort("capability")}
                      >
                        Capability
                        <SortIcon field="capability" />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto p-0 font-medium"
                        onClick={() => handleSort("provider")}
                      >
                        Provider
                        <SortIcon field="provider" />
                      </Button>
                    </TableHead>
                    <TableHead className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto p-0 font-medium"
                        onClick={() => handleSort("units")}
                      >
                        Units
                        <SortIcon field="units" />
                      </Button>
                    </TableHead>
                    <TableHead className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto p-0 font-medium"
                        onClick={() => handleSort("cost")}
                      >
                        Cost
                        <SortIcon field="cost" />
                      </Button>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEvents.map((event, _index) => (
                    <tr
                      key={event.id}
                      className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
                    >
                      <TableCell className="font-medium">
                        {new Date(event.date).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {CAPABILITY_LABELS[event.capability] ?? event.capability}
                        </Badge>
                      </TableCell>
                      <TableCell>{event.provider}</TableCell>
                      <TableCell className="text-right">
                        {event.units.toLocaleString()} {event.unitLabel}
                      </TableCell>
                      <TableCell className="text-right font-medium min-w-[7rem]">
                        <CreditDetailed value={event.cost} />
                      </TableCell>
                    </tr>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
