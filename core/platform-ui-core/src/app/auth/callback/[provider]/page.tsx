"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getOAuthErrorMessage } from "@/lib/oauth-errors";
import { sanitizeRedirectUrl } from "@/lib/utils";

function OAuthCallbackContent() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const provider = params.provider as string;
  const errorParam = searchParams.get("error");
  const [error, setError] = useState<string | null>(getOAuthErrorMessage(errorParam));

  useEffect(() => {
    if (errorParam) {
      setError(getOAuthErrorMessage(errorParam));
      return;
    }

    // Better Auth handles the token exchange server-side.
    // If we reach this page without an error, redirect to home.
    const callbackUrl = sanitizeRedirectUrl(searchParams.get("callbackUrl")) || "/onboarding";
    const timer = setTimeout(() => {
      router.push(callbackUrl);
    }, 1000);

    return () => clearTimeout(timer);
  }, [errorParam, router, searchParams]);

  if (error) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-background px-4 overflow-hidden">
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-[500px] w-[500px] rounded-full bg-terminal/5 blur-[120px]" />
        </div>
        <div className="relative z-10 w-full max-w-sm">
          <AuthShell>
            <Card className="crt-scanlines border-terminal/20 bg-black/80 shadow-[0_0_30px_rgba(0,255,65,0.08)]">
              <CardHeader>
                <CardTitle className="text-sm font-medium uppercase tracking-widest text-destructive">
                  Authentication failed
                </CardTitle>
                <CardDescription>Could not sign in with {provider}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-destructive">{error}</p>
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
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 overflow-hidden">
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-[500px] w-[500px] rounded-full bg-terminal/5 blur-[120px]" />
      </div>
      <div className="relative z-10 w-full max-w-sm">
        <AuthShell>
          <Card className="crt-scanlines border-terminal/20 bg-black/80 shadow-[0_0_30px_rgba(0,255,65,0.08)]">
            <CardHeader className="items-center">
              <Loader2 className="size-8 animate-spin text-terminal" />
              <CardTitle className="text-sm font-medium uppercase tracking-widest text-terminal">
                Authenticating
              </CardTitle>
              <CardDescription>Completing sign in with {provider}...</CardDescription>
            </CardHeader>
          </Card>
        </AuthShell>
      </div>
    </div>
  );
}

export default function OAuthCallbackPage() {
  return (
    <Suspense>
      <OAuthCallbackContent />
    </Suspense>
  );
}
