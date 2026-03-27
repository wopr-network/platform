"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useState } from "react";
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

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function validatePasswordComplexity(pw: string): string | null {
    if (pw.length < 12) return "Password must be at least 12 characters";
    if (!/[A-Z]/.test(pw)) return "Password must contain at least one uppercase letter";
    if (!/[a-z]/.test(pw)) return "Password must contain at least one lowercase letter";
    if (!/[0-9]/.test(pw)) return "Password must contain at least one digit";
    if (!/[^A-Za-z0-9]/.test(pw)) return "Password must contain at least one special character";
    return null;
  }

  if (!token) {
    return (
      <AuthShell>
        <Card className="crt-scanlines border-terminal/20 bg-black/80 shadow-[0_0_30px_rgba(0,255,65,0.08)]">
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-widest text-destructive">
              Access denied
            </CardTitle>
            <CardDescription>This password reset link is invalid or has expired.</CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Link
              href="/forgot-password"
              className="text-sm text-terminal-dim underline underline-offset-4 hover:text-terminal"
            >
              Request a new reset link
            </Link>
          </CardFooter>
        </Card>
      </AuthShell>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const complexityError = validatePasswordComplexity(password);
    if (complexityError) {
      setError(complexityError);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      const { error: fetchError } = await authClient.$fetch("/reset-password", {
        method: "POST",
        body: { newPassword: password, token: token as string },
      });

      if (fetchError) {
        setError(fetchError.message ?? "Failed to reset password");
        return;
      }

      router.push("/login");
    } catch {
      setError("A network error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <Card className="crt-scanlines border-terminal/20 bg-black/80 shadow-[0_0_30px_rgba(0,255,65,0.08)]">
        <CardHeader>
          <CardTitle className="text-sm font-medium uppercase tracking-widest text-terminal">
            Set new credentials
          </CardTitle>
          <CardDescription>Enter new access credentials</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4" id="reset-password-form">
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••••••"
                autoComplete="new-password"
                required
                minLength={12}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="placeholder:text-muted-foreground/50"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="••••••••••••"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="placeholder:text-muted-foreground/50"
              />
            </div>
            {error && <AuthError message={error} />}
            <Button type="submit" variant="terminal" className="w-full" disabled={loading}>
              {loading ? (
                <span className="inline-flex items-center gap-1">
                  UPDATING
                  <span className="h-4 w-1.5 animate-pulse bg-terminal" />
                </span>
              ) : (
                "Reset password"
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

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
