"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUp } from "@/lib/auth-client";
import { getBrandConfig, productName } from "@/lib/brand-config";
import { sanitizeRedirectUrl } from "@/lib/utils";

function getPasswordStrength(password: string): { score: number; label: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  const labels = ["Very weak", "Weak", "Fair", "Good", "Strong"];
  return { score, label: labels[Math.min(score, labels.length) - 1] ?? "" };
}

const strengthColors = [
  "bg-red-500",
  "bg-red-500",
  "bg-amber-500",
  "bg-terminal",
  "bg-terminal-dim",
];

const strengthLabelColors = [
  "text-destructive",
  "text-destructive",
  "text-yellow-500",
  "text-terminal",
  "text-terminal",
];

const strengthSegments = [
  { key: "seg-1", index: 0 },
  { key: "seg-2", index: 1 },
  { key: "seg-3", index: 2 },
  { key: "seg-4", index: 3 },
  { key: "seg-5", index: 4 },
];

function SignupForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);

  const strength = getPasswordStrength(password);

  const searchParams = useSearchParams();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (!agreedToTerms) {
      setError("You must agree to the terms of service");
      return;
    }

    setLoading(true);

    try {
      const { error: authError } = await signUp.email({
        name,
        email,
        password,
      });

      if (authError) {
        setError(authError.message ?? "Failed to create account");
        return;
      }

      // Show "check your email" interstitial instead of redirecting
      setSignupSuccess(true);
    } catch {
      setError("A network error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (signupSuccess) {
    return (
      <AuthShell>
        <Card className="crt-scanlines border-terminal/20 bg-black/80 shadow-[0_0_30px_rgba(0,255,65,0.08)]">
          <CardHeader className="items-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
            >
              <CardTitle className="text-sm font-medium uppercase tracking-widest text-terminal text-center">
                Transmission sent
              </CardTitle>
              <CardDescription className="text-center">
                We sent a verification link to <code className="text-terminal">{email}</code>
              </CardDescription>
            </motion.div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-center text-muted-foreground">
              Click the link to verify your account and receive your{" "}
              <span className="text-terminal font-medium">$5 signup credit</span>.
            </p>
            <p className="text-sm text-center text-muted-foreground">
              If you don&apos;t see it, check your spam folder.
            </p>
            <ResendVerificationButton email={email} />
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
            Create account
          </CardTitle>
          <CardDescription>Register for {productName()} access</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4" id="signup-form">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="OPERATOR NAME"
                autoComplete="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="placeholder:text-muted-foreground/50"
              />
            </div>
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
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••••••"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="placeholder:text-muted-foreground/50"
              />
              {password.length > 0 && (
                <div className="flex flex-col gap-1">
                  <div className="flex gap-1">
                    {strengthSegments.map((seg) => (
                      <div
                        key={seg.key}
                        className={`h-1 flex-1 rounded-full ${
                          seg.index < strength.score
                            ? strengthColors[strength.score - 1]
                            : "bg-terminal/20"
                        }`}
                      />
                    ))}
                  </div>
                  <span
                    className={`text-xs ${
                      strength.score > 0
                        ? strengthLabelColors[strength.score - 1]
                        : "text-muted-foreground"
                    }`}
                  >
                    {strength.label}
                  </span>
                </div>
              )}
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
            <div className="flex items-start gap-2 text-sm">
              <Checkbox
                id="agree-terms"
                checked={agreedToTerms}
                onCheckedChange={(checked) => setAgreedToTerms(checked === true)}
                className="mt-0.5 data-[state=checked]:border-terminal data-[state=checked]:bg-terminal"
              />
              <Label
                htmlFor="agree-terms"
                className="text-muted-foreground font-normal cursor-pointer"
              >
                I agree to the{" "}
                <Link
                  href="/terms"
                  className="text-terminal-dim underline underline-offset-4 hover:text-terminal"
                >
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link
                  href="/privacy"
                  className="text-terminal-dim underline underline-offset-4 hover:text-terminal"
                >
                  Privacy Policy
                </Link>
              </Label>
            </div>
            {error && <AuthError message={error} />}
            <Button type="submit" variant="terminal" className="w-full" disabled={loading}>
              {loading ? (
                <span className="inline-flex items-center gap-1">
                  INITIALIZING
                  <span className="h-4 w-1.5 animate-pulse bg-terminal" />
                </span>
              ) : (
                "Create account"
              )}
            </Button>
          </form>
          <OAuthButtons callbackUrl={sanitizeRedirectUrl(searchParams.get("callbackUrl"))} />
        </CardContent>
        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              href="/login"
              className="text-terminal-dim underline underline-offset-4 hover:text-terminal"
            >
              Sign in
            </Link>
          </p>
        </CardFooter>
      </Card>
    </AuthShell>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <AuthRedirect />
      <SignupForm />
    </Suspense>
  );
}
