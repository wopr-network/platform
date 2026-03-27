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
import { type AdminUserSummary, grantCredits } from "@/lib/admin-api";
import { formatCreditStandard } from "@/lib/format-credit";
import { cn } from "@/lib/utils";

function creditColor(cents: number): string {
  if (cents === 0) return "text-red-500";
  if (cents < 200) return "text-amber-500";
  return "text-terminal";
}

interface GrantCreditsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AdminUserSummary;
  onComplete: () => void;
}

export function GrantCreditsDialog({
  open,
  onOpenChange,
  user,
  onComplete,
}: GrantCreditsDialogProps) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const parsedAmount = Number.parseFloat(amount);
  const isValidAmount = !Number.isNaN(parsedAmount) && parsedAmount > 0;

  async function handleGrant() {
    const cents = Math.round(parsedAmount * 100);
    if (cents <= 0) return;
    setSubmitting(true);
    try {
      await grantCredits(user.tenant_id, cents, reason);
      onOpenChange(false);
      setAmount("");
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
          <DialogTitle className="uppercase tracking-wider font-bold">GRANT CREDITS</DialogTitle>
          <DialogDescription>
            Grant credits to <span className="font-mono text-terminal">{user.email}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="grant-amount">Amount</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                $
              </span>
              <Input
                id="grant-amount"
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="10.00"
                className="pl-7"
              />
            </div>
            <p className="text-xs text-muted-foreground font-mono">
              Current balance:{" "}
              <span className={cn(creditColor(user.credit_balance_cents))}>
                {formatCreditStandard(user.credit_balance_cents / 100)}
              </span>
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="grant-reason">Reason (required)</Label>
            <Input
              id="grant-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Promotional credit, support resolution"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="terminal"
            disabled={!isValidAmount || !reason.trim() || submitting}
            onClick={handleGrant}
          >
            {submitting
              ? "Granting..."
              : `Grant ${isValidAmount ? formatCreditStandard(parsedAmount) : "$0.00"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
