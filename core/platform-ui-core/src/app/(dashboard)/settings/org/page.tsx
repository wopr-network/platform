"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useIsAdminOrOwner } from "@/hooks/use-my-org-role";
import type { Organization, OrgMember } from "@/lib/api";
import {
  changeRole,
  getOrganization,
  inviteMember,
  removeMember,
  revokeInvite,
  transferOwnership,
  updateOrganization,
} from "@/lib/org-api";

function roleBadgeVariant(role: OrgMember["role"]) {
  if (role === "owner") return "terminal" as const;
  if (role === "admin") return "default" as const;
  return "outline" as const;
}

export default function OrgPage() {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const [org, setOrg] = useState<Organization | null>(null);
  const isAdminOrOwner = useIsAdminOrOwner(org);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [billingEmail, setBillingEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const saveSuccessTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (saveSuccessTimer.current) clearTimeout(saveSuccessTimer.current);
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getOrganization();
      setOrg(data);
      setOrgName(data.name);
      setOrgSlug(data.slug ?? "");
      setBillingEmail(data.billingEmail);
    } catch {
      routerRef.current.push("/settings/profile");
      return;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!org) return;
    setSaving(true);
    setSaveMsg(null);
    setSaveError(null);
    try {
      const updated = await updateOrganization(org.id, {
        name: orgName,
        slug: orgSlug || undefined,
        billingEmail: billingEmail || undefined,
      });
      setOrg(updated);
      setSaveMsg("Organization updated.");
      setSaveSuccess(true);
      saveSuccessTimer.current = setTimeout(() => setSaveSuccess(false), 2000);
    } catch {
      setSaveError("Failed to update organization. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(userId: string) {
    if (!org) return;
    const previousMembers = org.members;
    setOrg({ ...org, members: org.members.filter((m) => m.userId !== userId) });
    try {
      await removeMember(org.id, userId);
    } catch {
      setOrg({ ...org, members: previousMembers });
      setSaveError("Failed to remove member. Please try again.");
    }
  }

  async function handleTransfer(userId: string) {
    if (!org) return;
    setSaveError(null);
    try {
      await transferOwnership(org.id, userId);
      await load();
    } catch {
      setSaveError("Failed to transfer ownership. Please try again.");
    }
  }

  async function handleChangeRole(userId: string, role: "admin" | "member") {
    if (!org) return;
    setSaveError(null);
    try {
      await changeRole(org.id, userId, role);
      await load();
    } catch {
      setSaveError("Failed to change role. Please try again.");
    }
  }

  async function handleRevokeInvite(inviteId: string) {
    if (!org) return;
    const previousInvites = org.invites;
    setOrg({ ...org, invites: org.invites.filter((i) => i.id !== inviteId) });
    try {
      await revokeInvite(org.id, inviteId);
    } catch {
      setOrg({ ...org, invites: previousInvites });
      setSaveError("Failed to revoke invite. Please try again.");
    }
  }

  if (loading || !org) {
    return (
      <div className="max-w-3xl space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="rounded-sm border p-6 space-y-4">
          <Skeleton className="h-5 w-44" />
          <div className="space-y-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-full" />
          </div>
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="rounded-md border">
          {Array.from({ length: 3 }, (_, n) => `sk-${n}`).map((skId) => (
            <div key={skId} className="flex items-center gap-4 border-b px-4 py-3 last:border-b-0">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-5 w-14" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Organization</h1>
        <p className="text-sm text-muted-foreground">Manage your organization settings and team</p>
      </div>

      <AnimatePresence>
        {saveError && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {saveError}
          </motion.div>
        )}
      </AnimatePresence>

      {isAdminOrOwner ? (
        <Card>
          <CardHeader>
            <CardTitle>Organization Details</CardTitle>
            <CardDescription>Update your organization name and billing email</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="org-name">Organization name</Label>
                <Input
                  id="org-name"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="org-slug">Slug</Label>
                <Input
                  id="org-slug"
                  value={orgSlug}
                  onChange={(e) => setOrgSlug(e.target.value)}
                  placeholder="my-org"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="billing-email">Billing email</Label>
                <Input
                  id="billing-email"
                  type="email"
                  value={billingEmail}
                  onChange={(e) => setBillingEmail(e.target.value)}
                  required
                />
              </div>
              <AnimatePresence>
                {saveMsg && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="text-sm text-terminal"
                  >
                    {saveMsg}
                  </motion.p>
                )}
              </AnimatePresence>
              <Button type="submit" variant="terminal" className="w-fit" disabled={saving}>
                <AnimatePresence mode="wait">
                  {saveSuccess ? (
                    <motion.span
                      key="success"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="flex items-center gap-1"
                    >
                      <CheckIcon className="size-4" />
                      Saved
                    </motion.span>
                  ) : (
                    <motion.span
                      key="save"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      {saving ? "Saving..." : "Save changes"}
                    </motion.span>
                  )}
                </AnimatePresence>
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Organization Details</CardTitle>
            <CardDescription>You are a member of this organization</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2 text-sm">
              <div>
                <span className="font-medium text-muted-foreground">Name:</span> {org.name}
              </div>
              <div>
                <span className="font-medium text-muted-foreground">Slug:</span>{" "}
                {org.slug ?? <span className="text-muted-foreground italic">not set</span>}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Member avatar grid */}
      <div className="flex flex-wrap gap-2">
        {org.members.map((member) => (
          <div
            key={member.id}
            className={`flex size-10 items-center justify-center rounded-full bg-muted text-xs font-semibold ${
              member.role === "owner" ? "ring-2 ring-terminal/50" : ""
            }`}
            title={`${member.name} (${member.role})`}
          >
            {member.name
              .split(" ")
              .map((p) => p[0])
              .filter(Boolean)
              .slice(0, 2)
              .join("")
              .toUpperCase()}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Members</h2>
          <p className="text-sm text-muted-foreground">
            {org.members.length} member{org.members.length !== 1 ? "s" : ""}
          </p>
        </div>
        {isAdminOrOwner && <InviteDialog orgId={org.id} onInvited={load} />}
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
              {isAdminOrOwner && <TableHead className="w-[160px]" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {org.members.map((member) => (
              <TableRow key={member.id}>
                <TableCell className="font-medium">{member.name}</TableCell>
                <TableCell className="text-muted-foreground">{member.email}</TableCell>
                <TableCell>
                  <Badge variant={roleBadgeVariant(member.role)}>{member.role}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(member.joinedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </TableCell>
                {isAdminOrOwner && (
                  <TableCell>
                    {member.role !== "owner" && (
                      <div className="flex gap-1">
                        <ChangeRoleSelect
                          currentRole={member.role}
                          onChangeRole={(role) => handleChangeRole(member.userId, role)}
                        />
                        <TransferDialog
                          memberName={member.name}
                          onTransfer={() => handleTransfer(member.userId)}
                        />
                        <RemoveMemberDialog
                          memberName={member.name}
                          onRemove={() => handleRemove(member.userId)}
                        />
                      </div>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {isAdminOrOwner && org.invites.length > 0 && (
        <>
          <Separator />
          <div>
            <h2 className="text-lg font-semibold">Pending Invites</h2>
            <p className="text-sm text-muted-foreground">
              {org.invites.length} pending invite{org.invites.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {org.invites.map((invite) => (
                  <TableRow key={invite.id}>
                    <TableCell className="font-medium">{invite.email}</TableCell>
                    <TableCell>
                      <Badge variant={invite.role === "admin" ? "default" : "outline"}>
                        {invite.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(invite.expiresAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => handleRevokeInvite(invite.id)}
                      >
                        Revoke
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}

function ChangeRoleSelect({
  currentRole,
  onChangeRole,
}: {
  currentRole: "admin" | "member";
  onChangeRole: (role: "admin" | "member") => void;
}) {
  return (
    <Select value={currentRole} onValueChange={(v) => onChangeRole(v as "admin" | "member")}>
      <SelectTrigger className="h-7 w-24 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="admin">Admin</SelectItem>
        <SelectItem value="member">Member</SelectItem>
      </SelectContent>
    </Select>
  );
}

function InviteDialog({ orgId, onInvited }: { orgId: string; onInvited: () => void }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [inviteError, setInviteError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setInviteError(null);
    try {
      await inviteMember(orgId, email, role);
      setEmail("");
      setRole("member");
      setOpen(false);
      onInvited();
    } catch {
      setInviteError("Failed to send invitation. Please try again.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) setInviteError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="terminal">Invite member</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite Member</DialogTitle>
          <DialogDescription>Send an invitation to join your organization.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-email">Email address</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="colleague@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-role">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as "admin" | "member")}>
              <SelectTrigger id="invite-role" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="member">Member</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {inviteError && <p className="text-sm text-destructive">{inviteError}</p>}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit">Send invitation</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RemoveMemberDialog({
  memberName,
  onRemove,
}: {
  memberName: string;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive">
          Remove
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove Member</DialogTitle>
          <DialogDescription>
            Are you sure you want to remove <strong>{memberName}</strong> from the organization?
            They will lose access immediately.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            variant="destructive"
            onClick={() => {
              onRemove();
              setOpen(false);
            }}
          >
            Remove member
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TransferDialog({
  memberName,
  onTransfer,
}: {
  memberName: string;
  onTransfer: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-amber-500 hover:text-amber-400">
          Transfer
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transfer Ownership</DialogTitle>
          <DialogDescription>
            Transfer organization ownership to <strong>{memberName}</strong>? You will become an
            admin. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            variant="destructive"
            onClick={() => {
              onTransfer();
              setOpen(false);
            }}
          >
            Transfer ownership
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
