"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { AuthError } from "@/components/auth/auth-error";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { getBrandConfig } from "@/lib/brand-config";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { error: fetchError } = await authClient.$fetch("/request-password-reset", {
        method: "POST",
        body: { email, redirectTo: "/reset-password" },
      });

      if (fetchError) {
        setError(fetchError.message ?? "Failed to send reset email");
        return;
      }

      setSent(true);
    } catch {
      setError("A network error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <AuthShell>
        <Card className="crt-scanlines border-terminal/20 bg-black/80 shadow-[0_0_30px_rgba(0,255,65,0.08)]">
          <CardHeader>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
            >
              <CardTitle className="text-sm font-medium uppercase tracking-widest text-terminal">
                Transmission sent
              </CardTitle>
              <CardDescription>
                We sent a password reset link to <code className="text-terminal">{email}</code>
              </CardDescription>
            </motion.div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Click the link in the email to reset your password. If you don&apos;t see it, check
              your spam folder.
            </p>
          </CardContent>
          <CardFooter className="justify-center">
            <Link
              href="/login"
              className="text-sm text-terminal-dim underline underline-offset-4 hover:text-terminal"
            >
              Back to sign in
            </Link>
          </CardFooter>
        </Card>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <Card className="crt-scanlines border-terminal/20 bg-black/80 shadow-[0_0_30px_rgba(0,255,65,0.08)]">
        <CardHeader>
          <CardTitle className="text-sm font-medium uppercase tracking-widest text-terminal">
            Password Recovery
          </CardTitle>
          <CardDescription>Enter operator email for recovery code</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4" id="forgot-password-form">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder={`operator@${getBrandConfig().domain}`}
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="placeholder:text-muted-foreground/50"
              />
            </div>
            {error && <AuthError message={error} />}
            <Button type="submit" variant="terminal" className="w-full" disabled={loading}>
              {loading ? (
                <span className="inline-flex items-center gap-1">
                  TRANSMITTING
                  <span className="h-4 w-1.5 animate-pulse bg-terminal" />
                </span>
              ) : (
                "Send reset link"
              )}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center">
          <Link
            href="/login"
            className="text-sm text-terminal-dim underline underline-offset-4 hover:text-terminal"
          >
            Back to sign in
          </Link>
        </CardFooter>
      </Card>
    </AuthShell>
  );
}
