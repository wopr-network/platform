"use client";

import { Check } from "lucide-react";

interface ConfirmationTrackerProps {
  confirmations: number;
  confirmationsRequired: number;
  displayAmount: string;
  credited: boolean;
  txHash?: string;
}

export function ConfirmationTracker({
  confirmations,
  confirmationsRequired,
  displayAmount,
  credited,
  txHash,
}: ConfirmationTrackerProps) {
  const pct =
    confirmationsRequired > 0
      ? Math.min(100, Math.round((confirmations / confirmationsRequired) * 100))
      : 0;
  const detected = confirmations > 0 || credited;

  return (
    <div className="space-y-4 text-center">
      <p className="text-sm text-muted-foreground">
        {credited ? "Payment complete!" : "Payment received!"}
      </p>
      <p className="text-xl font-semibold">{displayAmount}</p>

      <div className="rounded-lg border border-border p-3 space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Confirmations</span>
          <span>
            {confirmations} / {confirmationsRequired}
          </span>
        </div>
        <div
          className="h-1.5 rounded-full bg-muted overflow-hidden"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="space-y-2 text-left">
        <div className="flex items-center gap-2">
          <div
            className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${detected ? "bg-green-500 text-white" : "bg-muted"}`}
          >
            {detected && <Check className="h-2.5 w-2.5" />}
          </div>
          <span
            className={`text-xs ${detected ? "text-muted-foreground" : "text-muted-foreground/50"}`}
          >
            Payment detected
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${credited ? "bg-green-500 text-white" : detected ? "bg-primary text-white animate-pulse" : "bg-muted"}`}
          >
            {credited ? <Check className="h-2.5 w-2.5" /> : detected ? <span>&middot;</span> : null}
          </div>
          <span className={`text-xs ${detected ? "text-foreground" : "text-muted-foreground/50"}`}>
            {credited ? "Confirmed" : "Confirming on chain"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${credited ? "bg-green-500 text-white" : "bg-muted"}`}
          >
            {credited && <Check className="h-2.5 w-2.5" />}
          </div>
          <span className={`text-xs ${credited ? "text-foreground" : "text-muted-foreground/50"}`}>
            Credits applied
          </span>
        </div>
      </div>

      {txHash && <p className="text-xs text-muted-foreground font-mono truncate">tx: {txHash}</p>}
    </div>
  );
}
