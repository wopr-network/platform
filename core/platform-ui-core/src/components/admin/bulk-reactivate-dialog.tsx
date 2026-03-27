"use client";

import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface BulkReactivateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  onConfirm: () => void;
  isLoading?: boolean;
}

function BulkReactivateDialog({
  open,
  onOpenChange,
  selectedCount,
  onConfirm,
  isLoading,
}: BulkReactivateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-emerald-500" />
            Reactivate <span className="text-terminal font-semibold">{selectedCount}</span> accounts
          </DialogTitle>
          <DialogDescription>
            These accounts will be restored to active status and users will regain platform access.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button variant="terminal" onClick={onConfirm} disabled={isLoading}>
            Reactivate {selectedCount} accounts
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { BulkReactivateDialog };
