"use client";

import { Search, Shield, ShieldCheck, ShieldOff, UserCog } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import type { AdminRole, UserRoleAssignment } from "@/lib/admin-api";
import { assignRole, getRolesList, revokeRole } from "@/lib/admin-api";
import { toUserMessage } from "@/lib/errors";

const PLATFORM_ROLES = ["platform_admin", "platform_support", "user"] as const;

function roleBadgeClass(role: string): string {
  switch (role) {
    case "platform_admin":
      return "bg-red-500/15 text-red-400 border-red-500/20";
    case "platform_support":
      return "bg-amber-500/15 text-amber-400 border-amber-500/20";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function RoleIcon({ role }: { role: string }) {
  if (role === "platform_admin") return <ShieldCheck className="h-3.5 w-3.5" />;
  if (role === "platform_support") return <Shield className="h-3.5 w-3.5" />;
  return <ShieldOff className="h-3.5 w-3.5 opacity-40" />;
}

interface RoleRowProps {
  assignment: UserRoleAssignment;
  onChanged: (userId: string, tenantId: string, newRole: string) => void;
}

function RoleRow({ assignment, onChanged }: RoleRowProps) {
  const [busy, setBusy] = useState(false);

  async function handleChange(newRole: string) {
    if (newRole === assignment.role) return;
    setBusy(true);
    try {
      if (newRole === "user") {
        await revokeRole(assignment.user_id, assignment.tenant_id, assignment.role);
      } else {
        if (assignment.role !== "user") {
          await revokeRole(assignment.user_id, assignment.tenant_id, assignment.role);
        }
        await assignRole(assignment.user_id, assignment.tenant_id, newRole);
      }
      onChanged(assignment.user_id, assignment.tenant_id, newRole);
      toast.success(`Role updated to ${newRole}.`);
    } catch (err) {
      toast.error(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <TableRow>
      <TableCell>
        <div>
          <p className="text-sm font-medium">{assignment.name ?? "(no name)"}</p>
          <p className="text-xs text-muted-foreground">{assignment.email}</p>
        </div>
      </TableCell>
      <TableCell>
        <code className="text-xs text-muted-foreground">{assignment.tenant_id}</code>
      </TableCell>
      <TableCell>
        <Badge
          variant="secondary"
          className={`${roleBadgeClass(assignment.role)} inline-flex items-center gap-1`}
        >
          <RoleIcon role={assignment.role} />
          {assignment.role}
        </Badge>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {assignment.assigned_at ? new Date(assignment.assigned_at).toLocaleDateString() : "—"}
      </TableCell>
      <TableCell>
        <Select value={assignment.role} onValueChange={handleChange} disabled={busy}>
          <SelectTrigger className="h-7 w-40 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PLATFORM_ROLES.map((r) => (
              <SelectItem key={r} value={r} className="text-xs">
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
    </TableRow>
  );
}

// ---- Role catalog panel ----

function RoleCatalog({ roles }: { roles: AdminRole[] }) {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="border-b border-border bg-muted/40 px-4 py-2.5 flex items-center gap-2">
        <UserCog className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">Available Roles</h3>
      </div>
      <div className="divide-y divide-border">
        {roles.map((role) => (
          <div key={role.id} className="flex items-start justify-between px-4 py-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className={`${roleBadgeClass(role.name)} text-xs`}>
                  {role.name}
                </Badge>
                {role.is_system && <span className="text-xs text-muted-foreground">(system)</span>}
              </div>
              {role.description && (
                <p className="text-xs text-muted-foreground">{role.description}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Main ----

export function RolesDashboard() {
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [assignments, setAssignments] = useState<UserRoleAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { roles: r, assignments: a } = await getRolesList();
      setRoles(r);
      setAssignments(a);
    } catch (err) {
      toast.error(toUserMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function handleRoleChanged(userId: string, tenantId: string, newRole: string) {
    setAssignments((prev) =>
      prev.map((a) =>
        a.user_id === userId && a.tenant_id === tenantId ? { ...a, role: newRole } : a,
      ),
    );
  }

  const filtered = assignments.filter((a) => {
    const matchSearch =
      !search ||
      a.email.toLowerCase().includes(search.toLowerCase()) ||
      (a.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      a.tenant_id.includes(search);
    const matchRole = filterRole === "all" || a.role === filterRole;
    return matchSearch && matchRole;
  });

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Roles</h1>
        <p className="text-muted-foreground text-sm">Manage platform roles and user assignments</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search users…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
            <Select value={filterRole} onValueChange={setFilterRole}>
              <SelectTrigger className="h-8 w-44 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                {PLATFORM_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={load}>
              Refresh
            </Button>
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }, (_, i) => `sk-row-${i}`).map((k) => (
                <Skeleton key={k} className="h-12 rounded-md" />
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead>User</TableHead>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Current Role</TableHead>
                    <TableHead>Assigned</TableHead>
                    <TableHead>Change Role</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-center text-muted-foreground py-8 text-sm"
                      >
                        No users found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((a) => (
                      <RoleRow
                        key={`${a.user_id}-${a.tenant_id}`}
                        assignment={a}
                        onChanged={handleRoleChanged}
                      />
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <div className="lg:col-span-1">
          {loading ? <Skeleton className="h-48 rounded-lg" /> : <RoleCatalog roles={roles} />}
        </div>
      </div>
    </div>
  );
}
