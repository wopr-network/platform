"use client";

import { Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  type AdminUserSummary,
  bulkGrantCredits,
  bulkReactivateTenants,
  bulkSuspendTenants,
  getUsersList,
} from "@/lib/admin-api";
import { formatCreditStandard } from "@/lib/format-credit";
import { cn } from "@/lib/utils";
import { BulkActionsBar } from "./bulk-actions-bar";
import { TenantRowActions } from "./tenant-row-actions";

const PAGE_SIZE = 25;

function statusBadgeClasses(status: string): string {
  switch (status) {
    case "active":
      return "bg-terminal/15 text-terminal border border-terminal/20";
    case "suspended":
      return "bg-destructive/15 text-red-400 border border-destructive/20";
    case "banned":
      return "bg-destructive/30 text-red-300 border border-destructive/30";
    case "trial":
      return "bg-chart-3/15 text-amber-400 border border-chart-3/20";
    default:
      return "bg-secondary text-muted-foreground border border-border";
  }
}

function creditColor(cents: number): string {
  if (cents === 0) return "text-red-500";
  if (cents < 200) return "text-amber-500";
  return "text-terminal";
}

export function TenantTable() {
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const debounceRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const load = useCallback(async (searchTerm: string, pageOffset: number) => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await getUsersList({
        search: searchTerm || undefined,
        limit: PAGE_SIZE,
        offset: pageOffset,
      });
      setUsers(result.users);
      setTotal(result.total);
    } catch {
      setLoadError("Failed to load users. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: search triggers via debounce not effect
  useEffect(() => {
    load(search, offset);
  }, [load, offset]);

  function handleSearchChange(value: string) {
    setSearch(value);
    setOffset(0);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(value, 0), 300);
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === total) {
      setSelected(new Set());
    } else {
      setSelected(new Set(users.map((u) => u.tenant_id)));
    }
  }

  const reload = useCallback(() => load(search, offset), [load, search, offset]);

  const hasSuspended = users.some((u) => selected.has(u.tenant_id) && u.status === "suspended");

  async function handleBulkSuspend() {
    const reason = window.prompt("Reason for suspension:");
    if (!reason) return;
    try {
      await bulkSuspendTenants(Array.from(selected), reason);
      setSelected(new Set());
      reload();
    } catch (err) {
      toast.error(
        `Failed to suspend tenants: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
  }

  async function handleBulkReactivate() {
    try {
      await bulkReactivateTenants(Array.from(selected));
      setSelected(new Set());
      reload();
    } catch (err) {
      toast.error(
        `Failed to reactivate tenants: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
  }

  async function handleBulkGrantCredits() {
    const amountStr = window.prompt("Amount to grant (in cents):");
    if (!amountStr) return;
    const amountCents = parseInt(amountStr, 10);
    if (Number.isNaN(amountCents) || amountCents <= 0) return;
    const reason = window.prompt("Reason for grant:");
    if (!reason) return;
    try {
      await bulkGrantCredits(Array.from(selected), amountCents, reason);
      setSelected(new Set());
      reload();
    } catch (err) {
      toast.error(
        `Failed to grant credits: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
  }

  function handleExport() {
    const selectedUsers = users.filter((u) => selected.has(u.tenant_id));
    const blob = new Blob([JSON.stringify(selectedUsers, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tenants-export.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold uppercase tracking-wider text-terminal [text-shadow:0_0_10px_rgba(0,255,65,0.25)]">
          USER MANAGEMENT
        </h1>
        <span className="text-sm text-muted-foreground font-mono">{total} users</span>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by email, name, or tenant ID..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-9 focus:border-terminal focus:ring-terminal/20"
        />
      </div>

      {/* Table */}
      <div className="rounded-sm border border-terminal/10">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary crt-scanlines">
              <TableHead className="w-10">
                <Checkbox
                  checked={total > 0 && selected.size === total}
                  onCheckedChange={toggleAll}
                />
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider">Email</TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider">Name</TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider">Status</TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider">Plan</TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider text-right">
                Credits
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider text-right">
                Agents
              </TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody
            className={cn(
              "transition-opacity duration-150",
              loading && users.length > 0 && "opacity-60",
            )}
          >
            {loading && users.length === 0 ? (
              Array.from({ length: 8 }).map((_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows have no stable ID
                <TableRow key={`skel-${i}`} className="h-10">
                  {Array.from({ length: 8 }).map((_, j) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: skeleton cells
                    <TableCell key={`skel-${i}-${j}`}>
                      <Skeleton className="h-4 w-full" style={{ animationDelay: `${i * 50}ms` }} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : loadError ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center">
                  <p className="text-sm text-destructive font-mono">{loadError}</p>
                </TableCell>
              </TableRow>
            ) : users.length === 0 && !loading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center">
                  <p className="text-sm text-muted-foreground font-mono">
                    &gt; No users found
                    <span className="animate-ellipsis" />
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Try adjusting your search query
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow
                  key={user.id}
                  className={cn(
                    "h-10 hover:bg-secondary/50",
                    selected.has(user.tenant_id) && "bg-terminal/5",
                  )}
                >
                  <TableCell>
                    <Checkbox
                      checked={selected.has(user.tenant_id)}
                      onCheckedChange={() => toggleSelect(user.tenant_id)}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-sm">{user.email}</TableCell>
                  <TableCell className="text-sm">{user.name ?? "--"}</TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium",
                        statusBadgeClasses(user.status),
                      )}
                    >
                      {user.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{user.role}</TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-mono text-xs",
                      creditColor(user.credit_balance_cents),
                    )}
                  >
                    {formatCreditStandard(user.credit_balance_cents / 100)}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {user.agent_count}
                  </TableCell>
                  <TableCell>
                    <TenantRowActions user={user} onAction={reload} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-xs text-muted-foreground font-mono">
          <span>
            Showing {offset + 1}-{Math.min(offset + PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="xs"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              Previous
            </Button>
            <Button
              variant="ghost"
              size="xs"
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Bulk actions */}
      <BulkActionsBar
        selectedCount={selected.size}
        allMatchingSelected={selected.size === users.length && users.length === total}
        hasSuspendedInSelection={hasSuspended}
        onGrantCredits={handleBulkGrantCredits}
        onExport={handleExport}
        onSuspend={handleBulkSuspend}
        onReactivate={handleBulkReactivate}
        onClearSelection={() => setSelected(new Set())}
      />
    </div>
  );
}
