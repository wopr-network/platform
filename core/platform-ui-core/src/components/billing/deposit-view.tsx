"use client";

import { Check, Copy } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { CheckoutResult } from "@/lib/api";

interface DepositViewProps {
  checkout: CheckoutResult;
  status: "waiting" | "partial" | "confirming" | "credited" | "expired" | "failed";
  onBack: () => void;
}

export function DepositView({ checkout, status, onBack }: DepositViewProps) {
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30 * 60);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(checkout.depositAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [checkout.depositAddress]);

  useEffect(() => {
    if (status !== "waiting") return;
    const timer = setInterval(() => setTimeLeft((t) => Math.max(0, t - 1)), 1000);
    return () => clearInterval(timer);
  }, [status]);

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;

  return (
    <div className="space-y-4 text-center">
      <button
        type="button"
        onClick={onBack}
        className="text-sm text-muted-foreground hover:text-foreground self-start"
      >
        &larr; Back
      </button>
      <p className="text-sm text-muted-foreground">Send exactly</p>
      <p className="text-2xl font-semibold">{checkout.displayAmount}</p>
      <p className="text-xs text-muted-foreground">
        on {checkout.chain} &middot; ${checkout.amountUsd.toFixed(2)} USD
      </p>
      <div
        className="mx-auto w-fit rounded-lg border border-border bg-background p-3"
        aria-hidden="true"
      >
        <QRCodeSVG
          value={checkout.depositAddress}
          size={140}
          bgColor="hsl(var(--background))"
          fgColor="hsl(var(--foreground))"
        />
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2">
        <code className="flex-1 truncate text-xs font-mono">{checkout.depositAddress}</code>
        <Button variant="ghost" size="sm" onClick={handleCopy} aria-label="Copy address">
          {copied ? (
            <Check className="h-3.5 w-3.5 text-primary" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
      <div className="flex items-center justify-center gap-2 rounded-lg border border-border p-2">
        {status === "waiting" && (
          <>
            <span className="h-2 w-2 animate-pulse rounded-full bg-yellow-500" />
            <span className="text-xs text-yellow-500">Waiting for payment...</span>
            <span className="text-xs text-muted-foreground">
              &middot; {mins}:{secs.toString().padStart(2, "0")}
            </span>
          </>
        )}
        {status === "partial" && (
          <>
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            <span className="text-xs text-blue-500">Partial payment received</span>
          </>
        )}
        {status === "expired" && <span className="text-xs text-destructive">Payment expired</span>}
        {status === "failed" && <span className="text-xs text-destructive">Payment failed</span>}
      </div>
    </div>
  );
}
