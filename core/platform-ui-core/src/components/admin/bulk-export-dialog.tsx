"use client";

import { ArrowRight, Download } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

type ExportFieldKey =
  | "account_info"
  | "credit_balance"
  | "monthly_products"
  | "lifetime_spend"
  | "last_seen"
  | "transaction_history";

interface ExportFieldConfig {
  key: ExportFieldKey;
  label: string;
  description?: string;
  large?: boolean;
}

const EXPORT_FIELDS: ExportFieldConfig[] = [
  { key: "account_info", label: "Account info", description: "name, email, status, role" },
  { key: "credit_balance", label: "Credit balance" },
  { key: "monthly_products", label: "Monthly products" },
  { key: "lifetime_spend", label: "Lifetime spend" },
  { key: "last_seen", label: "Last seen" },
  { key: "transaction_history", label: "Full transaction history", large: true },
];

interface BulkExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  onConfirm: (fields: Array<{ key: ExportFieldKey; enabled: boolean }>) => void;
  isLoading?: boolean;
}

function BulkExportDialog({
  open,
  onOpenChange,
  selectedCount,
  onConfirm,
  isLoading,
}: BulkExportDialogProps) {
  const [enabledFields, setEnabledFields] = useState<Set<ExportFieldKey>>(
    new Set(["account_info", "credit_balance", "monthly_products", "lifetime_spend", "last_seen"]),
  );

  const toggleField = (key: ExportFieldKey) => {
    setEnabledFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    const fields = EXPORT_FIELDS.map((f) => ({ key: f.key, enabled: enabledFields.has(f.key) }));
    onConfirm(fields);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setEnabledFields(
        new Set([
          "account_info",
          "credit_balance",
          "monthly_products",
          "lifetime_spend",
          "last_seen",
        ]),
      );
    }
    onOpenChange(next);
  };

  const standardFields = EXPORT_FIELDS.filter((f) => !f.large);
  const largeFields = EXPORT_FIELDS.filter((f) => f.large);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="size-5 text-muted-foreground" />
            Export data for {selectedCount} tenants
          </DialogTitle>
          <DialogDescription>Select which fields to include in the CSV export.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1">
          {standardFields.map((field) => (
            <div key={field.key} className="flex items-start gap-3 py-2">
              <Checkbox
                id={`export-${field.key}`}
                checked={enabledFields.has(field.key)}
                onCheckedChange={() => toggleField(field.key)}
                className="mt-0.5"
              />
              <div className="flex flex-col">
                <Label htmlFor={`export-${field.key}`} className="cursor-pointer">
                  {field.label}
                </Label>
                {field.description && (
                  <span className="text-xs text-muted-foreground">{field.description}</span>
                )}
              </div>
            </div>
          ))}

          <Separator className="my-1" />

          {largeFields.map((field) => (
            <div key={field.key} className="flex items-start gap-3 py-2">
              <Checkbox
                id={`export-${field.key}`}
                checked={enabledFields.has(field.key)}
                onCheckedChange={() => toggleField(field.key)}
                className="mt-0.5"
              />
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Label htmlFor={`export-${field.key}`} className="cursor-pointer">
                    {field.label}
                  </Label>
                  <Badge variant="secondary">large</Badge>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <Label>Format</Label>
          <Select defaultValue="csv" disabled>
            <SelectTrigger className="w-full opacity-60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="csv">CSV</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            variant="terminal"
            onClick={handleConfirm}
            disabled={enabledFields.size === 0 || isLoading}
          >
            <Download className="size-4" />
            Generate export
            <ArrowRight className="size-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { BulkExportDialog };
export type { ExportFieldKey };
