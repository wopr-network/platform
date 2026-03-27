"use client";

import { motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

interface ResendVerificationButtonProps {
  email: string;
  variant?: "terminal" | "outline" | "ghost" | "link";
  className?: string;
}

export function ResendVerificationButton({
  email,
  variant = "terminal",
  className,
}: ResendVerificationButtonProps) {
  const [cooldown, setCooldown] = useState(0);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const handleResend = useCallback(async () => {
    if (cooldown > 0 || sending || !email) return;
    setSending(true);
    setError(null);
    setSent(false);

    try {
      const { error: resendError } = await authClient.sendVerificationEmail({
        email,
        callbackURL: "/auth/verify?status=success",
      });
      if (resendError) {
        setError(resendError.message ?? "Failed to send verification email");
        return;
      }
      setSent(true);
      setCooldown(59);
      intervalRef.current = setInterval(() => {
        setCooldown((prev) => {
          if (prev <= 1) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch {
      setError("A network error occurred. Please try again.");
    } finally {
      setSending(false);
    }
  }, [email, cooldown, sending]);

  const buttonText = sending
    ? "Sending..."
    : cooldown > 0
      ? `Resend in ${cooldown}s`
      : "Resend verification email";

  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant={variant}
        className={className}
        disabled={cooldown > 0 || sending || !email}
        onClick={handleResend}
      >
        <span className={cooldown > 0 ? "tabular-nums" : undefined}>{buttonText}</span>
      </Button>
      {sent && cooldown > 0 && (
        <motion.p
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="text-xs text-terminal"
        >
          Verification email sent!
        </motion.p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
