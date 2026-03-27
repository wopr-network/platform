"use client";

import { motion } from "framer-motion";
import { CheckCircle, Clock, Mail, ShieldAlert, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResendVerificationButton } from "@/components/auth/resend-verification-button";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function SuccessContent() {
  const router = useRouter();
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          router.push("/onboarding");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [router]);

  return (
    <Card className="crt-scanlines border-terminal/20 bg-black/80 shadow-[0_0_30px_rgba(0,255,65,0.08)]">
      <CardHeader className="items-center">
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
        >
          <div className="rounded-full bg-terminal/10 p-3">
            <CheckCircle className="size-10 text-terminal" />
          </div>
        </motion.div>
        <CardTitle className="text-sm font-medium uppercase tracking-widest text-terminal text-center">
          Email verified
        </CardTitle>
        <CardDescription className="text-center">
          Your email has been verified successfully.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-center text-muted-foreground">
          Your <span className="text-terminal font-medium">$5 signup credit</span> has been applied
          to your account.
        </p>
        <p className="text-sm text-center text-muted-foreground">
          Redirecting in <span className="text-terminal font-medium tabular-nums">{countdown}</span>
          <span className="inline-block h-4 w-1.5 animate-pulse bg-terminal ml-0.5 align-middle" />
        </p>
      </CardContent>
      <CardFooter className="justify-center">
        <Link
          href="/onboarding"
          className="text-sm text-terminal-dim underline underline-offset-4 hover:text-terminal"
        >
          Continue to setup
        </Link>
      </CardFooter>
    </Card>
  );
}

function ErrorContent({
  status,
  reason,
  email,
}: {
  status: string | null;
  reason: string | null;
  email: string | null;
}) {
  let icon: React.ReactNode;
  let title: string;
  let description: string;
  let footer: React.ReactNode;

  switch (reason) {
    case "token-expired":
      icon = (
        <div className="rounded-full bg-amber-500/10 p-3">
          <Clock className="size-10 text-amber-500" />
        </div>
      );
      title = "Link expired";
      description = "This verification link has expired.";
      footer = email ? (
        <CardContent>
          <ResendVerificationButton email={email} className="w-full" />
        </CardContent>
      ) : (
        <CardContent>
          <Button variant="terminal" className="w-full" asChild>
            <Link href="/login">Back to sign in</Link>
          </Button>
        </CardContent>
      );
      break;

    case "already-verified":
      icon = (
        <div className="rounded-full bg-muted/50 p-3">
          <Mail className="size-10 text-muted-foreground" />
        </div>
      );
      title = "Already verified";
      description = "This email address has already been verified.";
      footer = null;
      break;

    case "invalid-token":
      icon = (
        <div className="rounded-full bg-destructive/10 p-3">
          <ShieldAlert className="size-10 text-destructive" />
        </div>
      );
      title = "Invalid link";
      description = "This verification link is invalid or malformed.";
      footer = null;
      break;

    default:
      icon = (
        <div className="rounded-full bg-destructive/10 p-3">
          <XCircle className="size-10 text-destructive" />
        </div>
      );
      title = "Verification failed";
      description = status
        ? "Something went wrong verifying your email."
        : "No verification status provided.";
      footer = null;
      break;
  }

  const titleColor = reason === "already-verified" ? "text-terminal" : "text-destructive";
  const footerLink =
    reason === "already-verified" ? (
      <Link
        href="/login"
        className="text-sm text-terminal-dim underline underline-offset-4 hover:text-terminal"
      >
        Sign in
      </Link>
    ) : (
      <Link
        href="/login"
        className="text-sm text-terminal-dim underline underline-offset-4 hover:text-terminal"
      >
        Back to sign in
      </Link>
    );

  return (
    <Card className="crt-scanlines border-terminal/20 bg-black/80 shadow-[0_0_30px_rgba(0,255,65,0.08)]">
      <CardHeader className="items-center">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          {icon}
        </motion.div>
        <CardTitle
          className={`text-sm font-medium uppercase tracking-widest ${titleColor} text-center`}
        >
          {title}
        </CardTitle>
        <CardDescription className="text-center">{description}</CardDescription>
      </CardHeader>
      {footer}
      <CardFooter className="justify-center">{footerLink}</CardFooter>
    </Card>
  );
}

function VerifyContent() {
  const searchParams = useSearchParams();
  const status = searchParams.get("status");
  const reason = searchParams.get("reason");
  const emailParam = searchParams.get("email");

  const isSuccess = status === "success";

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 overflow-hidden">
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-[500px] w-[500px] rounded-full bg-terminal/5 blur-[120px]" />
      </div>
      <div className="relative z-10 w-full max-w-sm">
        <AuthShell>
          {isSuccess ? (
            <SuccessContent />
          ) : (
            <ErrorContent status={status} reason={reason} email={emailParam} />
          )}
        </AuthShell>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyContent />
    </Suspense>
  );
}
