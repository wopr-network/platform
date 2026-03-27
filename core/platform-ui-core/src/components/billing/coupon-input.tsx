"use client";

import { Check, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toUserMessage } from "@/lib/errors";
import { trpcVanilla } from "@/lib/trpc";
import { cn } from "@/lib/utils";

type CouponState = "idle" | "loading" | "success" | "error";

export function CouponInput() {
  const [code, setCode] = useState("");
  const [state, setState] = useState<CouponState>("idle");
  const [message, setMessage] = useState("");
  const [creditsGranted, setCreditsGranted] = useState(0);

  async function handleApply() {
    if (!code.trim()) return;
    setState("loading");
    setMessage("");
    try {
      const result = (await trpcVanilla.billing.applyCoupon.mutate({
        code: code.trim().toUpperCase(),
      })) as { creditsGranted: number; message: string };
      setCreditsGranted(result.creditsGranted);
      setMessage(result.message);
      setState("success");
    } catch (err) {
      setMessage(toUserMessage(err, "Invalid coupon code"));
      setState("error");
    }
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="coupon-code">Coupon code</Label>
      <div className="flex gap-2">
        <Input
          id="coupon-code"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            if (state !== "idle" && state !== "loading") setState("idle");
          }}
          placeholder="Coupon code"
          className={cn(
            "font-mono uppercase max-w-xs",
            state === "success" && "border-terminal/50",
            state === "error" && "border-destructive/50",
          )}
          disabled={state === "loading" || state === "success"}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleApply();
          }}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={handleApply}
          disabled={!code.trim() || state === "loading" || state === "success"}
        >
          {state === "loading" ? "Applying..." : "Apply"}
        </Button>
      </div>

      <div aria-live="polite" aria-atomic="true">
        {state === "success" && (
          <p className="flex items-center gap-1.5 text-sm text-terminal">
            <Check className="h-4 w-4" />
            Code applied — +{creditsGranted} credits added to your balance
          </p>
        )}

        {state === "error" && (
          <p className="flex items-center gap-1.5 text-sm text-destructive">
            <X className="h-4 w-4" />
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
