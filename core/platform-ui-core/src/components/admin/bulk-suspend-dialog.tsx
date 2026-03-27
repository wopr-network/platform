"use client";

import { ShieldBan } from "lucide-react";
import { useState } from "react";
import { Banner } from "@/components/ui/banner";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface BulkSuspendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  onConfirm: (reason: string, notifyByEmail: boolean) => void;
  onPreview: () => void;
  isLoading?: boolean;
}

function BulkSuspendDialog({
  open,
  onOpenChange,
  selectedCount,
  onConfirm,
  onPreview,
  isLoading,
}: BulkSuspendDialogProps) {
  const [reason, setReason] = useState("");
  const [notifyByEmail, setNotifyByEmail] = useState(false);
  const [wantsPreview, setWantsPreview] = useState(false);

  const handleConfirm = () => {
    if (!reason.trim()) return;
    if (wantsPreview) {
      onPreview();
      return;
    }
    onConfirm(reason.trim(), notifyByEmail);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setReason("");
      setNotifyByEmail(false);
      setWantsPreview(false);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldBan className="size-5 text-amber-500" />
            <span className="text-amber-500">Suspend</span>{" "}
            <span className="font-semibold">{selectedCount}</span> accounts
          </DialogTitle>
          <DialogDescription>
            Suspended accounts will immediately lose platform access.
          </DialogDescription>
        </DialogHeader>

        <Banner variant="warning">
          This will immediately prevent these accounts from using the platform. Users will be locked
          out.
        </Banner>

        <div className="flex flex-col gap-4">
          <div className="space-y-2">
            <Label htmlFor="suspend-reason">Reason</Label>
            <Textarea
              id="suspend-reason"
              rows={3}
              placeholder="e.g. Dormant account cleanup"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-3">
            <Checkbox
              id="suspend-notify"
              checked={notifyByEmail}
              onCheckedChange={(checked) => setNotifyByEmail(checked === true)}
            />
            <Label htmlFor="suspend-notify" className="cursor-pointer">
              Notify each user by email
            </Label>
          </div>

          <div className="flex items-center gap-3">
            <Checkbox
              id="suspend-preview"
              checked={wantsPreview}
              onCheckedChange={(checked) => setWantsPreview(checked === true)}
            />
            <Label htmlFor="suspend-preview" className="cursor-pointer">
              Preview list before executing
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!reason.trim() || isLoading}
          >
            Suspend {selectedCount} accounts
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { BulkSuspendDialog };
