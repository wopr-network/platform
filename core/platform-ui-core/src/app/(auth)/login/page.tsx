"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useState } from "react";
import { AuthError } from "@/components/auth/auth-error";
import { AuthRedirect } from "@/components/auth/auth-redirect";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResendVerificationButton } from "@/components/auth/resend-verification-button";
import { OAuthButtons } from "@/components/oauth-buttons";
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
import { signIn } from "@/lib/auth-client";
import { getBrandConfig, productName } from "@/lib/brand-config";
import { sanitizeRedirectUrl } from "@/lib/utils";

function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<
    "credentials" | "unverified" | "suspended" | "generic" | null
  >(null);
  const [loading, setLoading] = useState(false);

  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setErrorType(null);
    setLoading(true);

    try {
      const { error: authError } = await signIn.email({
        email,
        password,
      });

      if (authError) {
        if (authError.status === 403) {
          setErrorType("unverified");
          setError("Please verify your email address before signing in.");
        } else if (
          authError.code === "ACCOUNT_SUSPENDED" ||
          authError.code === "ACCOUNT_BANNED" ||
          authError.message?.toLowerCase().includes("suspended") ||
          authError.message?.toLowerCase().includes("banned")
        ) {
          setErrorType("suspended");
          setError("Your account has been suspended. Please contact support.");
        } else {
          setErrorType("credentials");
          setError("Invalid email or password. Please try again.");
        }
        return;
      }

      const callbackUrl = sanitizeRedirectUrl(searchParams.get("callbackUrl"));
      router.push(callbackUrl);
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
            Sign in
          </CardTitle>
          <CardDescription>Access your {productName()} terminal</CardDescription>
        </CardHeader>
        <CardContent>
          {reason === "expired" && (
            <div className="mb-4 rounded-md border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-200">
              Your session has expired. Please sign in again.
            </div>
          )}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4" id="login-form">
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
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-terminal-dim hover:text-terminal"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••••••"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="placeholder:text-muted-foreground/50"
              />
            </div>
            {error && (
              <div className="flex flex-col gap-2">
                <AuthError message={error} />
                {errorType === "unverified" && (
                  <ResendVerificationButton
                    email={email}
                    variant="outline"
                    className="w-full border-terminal/30 hover:border-terminal hover:bg-terminal/5 hover:text-terminal"
                  />
                )}
                {errorType === "suspended" && (
                  <p className="text-xs text-muted-foreground text-center">
                    If you believe this is an error, contact{" "}
                    <a
                      href={`mailto:${getBrandConfig().emails.support}`}
                      className="text-terminal-dim underline underline-offset-4 hover:text-terminal"
                    >
                      {getBrandConfig().emails.support}
                    </a>
                  </p>
                )}
              </div>
            )}
            <Button type="submit" variant="terminal" className="w-full" disabled={loading}>
              {loading ? (
                <span className="inline-flex items-center gap-1">
                  AUTHENTICATING
                  <span className="h-4 w-1.5 animate-pulse bg-terminal" />
                </span>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>
          <OAuthButtons callbackUrl={sanitizeRedirectUrl(searchParams.get("callbackUrl"))} />
        </CardContent>
        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link
              href="/signup"
              className="text-terminal-dim underline underline-offset-4 hover:text-terminal"
            >
              Sign up
            </Link>
          </p>
        </CardFooter>
      </Card>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <AuthRedirect />
      <LoginForm />
    </Suspense>
  );
}
