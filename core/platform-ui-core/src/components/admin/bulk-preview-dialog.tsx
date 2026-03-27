"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface PreviewTenant {
  tenantId: string;
  name: string | null;
  email: string;
  status: string;
}

interface BulkPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenants: PreviewTenant[];
  actionLabel: string;
  actionVariant: "terminal" | "destructive";
  onBack: () => void;
  onConfirm: () => void;
  isLoading?: boolean;
}

function BulkPreviewDialog({
  open,
  onOpenChange,
  tenants,
  actionLabel,
  actionVariant,
  onBack,
  onConfirm,
  isLoading,
}: BulkPreviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Preview: {tenants.length} tenants will be affected</DialogTitle>
          <DialogDescription>
            Review the list of tenants before executing the operation.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-80 overflow-y-auto rounded-sm border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Tenant ID</TableHead>
                <TableHead className="text-xs">Name</TableHead>
                <TableHead className="text-xs">Email</TableHead>
                <TableHead className="text-xs">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.map((tenant) => (
                <TableRow key={tenant.tenantId}>
                  <TableCell className="text-xs font-mono">{tenant.tenantId}</TableCell>
                  <TableCell className="text-xs">{tenant.name ?? "-"}</TableCell>
                  <TableCell className="text-xs">{tenant.email}</TableCell>
                  <TableCell className="text-xs">{tenant.status}</TableCell>
                </TableRow>
              ))}
              {tenants.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-8">
                    No matching tenants found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button variant="outline" onClick={onBack} disabled={isLoading}>
            Back
          </Button>
          <Button variant={actionVariant} onClick={onConfirm} disabled={isLoading}>
            {actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { BulkPreviewDialog };
export type { PreviewTenant };
