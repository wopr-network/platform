"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const PRESETS = [10, 25, 50, 100];

interface AmountSelectorProps {
  onSelect: (amount: number) => void;
}

export function AmountSelector({ onSelect }: AmountSelectorProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [custom, setCustom] = useState("");

  const activeAmount = custom ? Number(custom) : selected;
  const isValid = activeAmount !== null && activeAmount >= 10 && Number.isFinite(activeAmount);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PRESETS.map((amt) => (
          <button
            key={amt}
            type="button"
            onClick={() => {
              setSelected(amt);
              setCustom("");
            }}
            className={cn(
              "rounded-md border p-3 text-lg font-bold transition-colors hover:bg-accent",
              selected === amt && !custom
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border",
            )}
          >
            ${amt}
          </button>
        ))}
      </div>
      <Input
        type="number"
        min={10}
        placeholder="Custom amount..."
        value={custom}
        onChange={(e) => {
          setCustom(e.target.value);
          setSelected(null);
        }}
      />
      <Button
        onClick={() => {
          if (isValid && activeAmount !== null) {
            onSelect(activeAmount);
          }
        }}
        disabled={!isValid}
        className="w-full"
      >
        Continue to payment
      </Button>
    </div>
  );
}
