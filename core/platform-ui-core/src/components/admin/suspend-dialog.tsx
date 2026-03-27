"use client";

import { useState } from "react";
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
import { type AdminUserSummary, reactivateTenant, suspendTenant } from "@/lib/admin-api";

interface SuspendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AdminUserSummary;
  onComplete: () => void;
}

export function SuspendDialog({ open, onOpenChange, user, onComplete }: SuspendDialogProps) {
  const isSuspended = user.status === "suspended";
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setSubmitting(true);
    try {
      if (isSuspended) {
        await reactivateTenant(user.tenant_id);
      } else {
        await suspendTenant(user.tenant_id, reason);
      }
      onOpenChange(false);
      setReason("");
      onComplete();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-terminal/10">
        <DialogHeader>
          <DialogTitle className="uppercase tracking-wider font-bold">
            {isSuspended ? "REACTIVATE TENANT" : "SUSPEND TENANT"}
          </DialogTitle>
          <DialogDescription>
            {isSuspended ? (
              <>
                Reactivate <span className="font-mono text-terminal">{user.email}</span>? Their bots
                will resume.
              </>
            ) : (
              <>
                Suspend <span className="font-mono text-terminal">{user.email}</span>? Their running
                bots will be paused immediately.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        {!isSuspended && (
          <div className="space-y-2">
            <Label htmlFor="suspend-reason">Reason (required)</Label>
            <Input
              id="suspend-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Payment overdue, TOS violation"
            />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={isSuspended ? "terminal" : "destructive"}
            disabled={(!isSuspended && !reason.trim()) || submitting}
            onClick={handleConfirm}
          >
            {submitting
              ? isSuspended
                ? "Reactivating..."
                : "Suspending..."
              : isSuspended
                ? "Reactivate"
                : "Suspend"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
