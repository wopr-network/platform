"use client";

import { Gift } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { formatCreditStandard } from "@/lib/format-credit";
import { cn } from "@/lib/utils";

interface BulkGrantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  onConfirm: (amountCents: number, reason: string, notifyByEmail: boolean) => void;
  isLoading?: boolean;
}

function BulkGrantDialog({
  open,
  onOpenChange,
  selectedCount,
  onConfirm,
  isLoading,
}: BulkGrantDialogProps) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [notifyByEmail, setNotifyByEmail] = useState(false);

  const amountCents = useMemo(() => {
    const parsed = Number.parseFloat(amount);
    return Number.isNaN(parsed) || parsed <= 0 ? 0 : Math.round(parsed * 100);
  }, [amount]);

  const totalCents = amountCents * selectedCount;
  const totalFormatted = formatCreditStandard(totalCents / 100);
  const perTenantFormatted = formatCreditStandard(amountCents / 100);

  const handleConfirm = () => {
    if (amountCents > 0 && reason.trim()) {
      onConfirm(amountCents, reason.trim(), notifyByEmail);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setAmount("");
      setReason("");
      setNotifyByEmail(false);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="size-5 text-terminal" />
            Grant credits to <span className="text-terminal font-semibold">{selectedCount}</span>{" "}
            tenants
          </DialogTitle>
          <DialogDescription>
            Grant a fixed amount to each selected tenant account.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="space-y-2">
            <Label htmlFor="grant-amount">Amount per tenant</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                $
              </span>
              <Input
                id="grant-amount"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="5.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="pl-7 text-right"
              />
            </div>
            {amountCents > 0 && (
              <p
                className={cn("text-sm", {
                  "text-muted-foreground": totalCents < 100_000,
                  "text-amber-500": totalCents >= 100_000 && totalCents < 1_000_000,
                  "text-red-500": totalCents >= 1_000_000,
                })}
              >
                Total: {totalFormatted}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="grant-reason">Reason</Label>
            <Input
              id="grant-reason"
              placeholder="e.g. Service outage Feb 10"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-3">
            <Checkbox
              id="grant-notify"
              checked={notifyByEmail}
              onCheckedChange={(checked) => setNotifyByEmail(checked === true)}
            />
            <Label htmlFor="grant-notify" className="cursor-pointer">
              Notify each user by email
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            variant="terminal"
            onClick={handleConfirm}
            disabled={amountCents === 0 || !reason.trim() || isLoading}
          >
            Grant {perTenantFormatted} x {selectedCount} = {totalFormatted}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { BulkGrantDialog };
