"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { ConfigField } from "@/lib/channel-manifests";
import { cn } from "@/lib/utils";

interface FieldInteractiveProps {
  field: ConfigField;
  value: string;
  onChange: (key: string, value: string) => void;
  error?: string;
}

export function FieldInteractive({ field, value, onChange, error }: FieldInteractiveProps) {
  if (field.type === "select" && field.options) {
    return (
      <div className="space-y-2">
        <Label htmlFor={field.key}>{field.label}</Label>
        {field.description && <p className="text-sm text-muted-foreground">{field.description}</p>}
        <div className="space-y-2">
          {field.options.map((option) => (
            <Button
              key={option.value}
              type="button"
              variant="ghost"
              onClick={() => onChange(field.key, option.value)}
              className={cn(
                "flex w-full items-center rounded-sm border px-4 py-3 text-left text-sm h-auto transition-colors hover:bg-transparent",
                value === option.value
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border hover:border-primary/50 hover:bg-accent",
              )}
            >
              <span className="flex-1">{option.label}</span>
              {value === option.value && (
                <span className="text-primary text-xs font-medium">Selected</span>
              )}
            </Button>
          ))}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  return null;
}
