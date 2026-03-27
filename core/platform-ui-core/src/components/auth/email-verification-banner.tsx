"use client";

import { Mail } from "lucide-react";
import { Banner } from "@/components/ui/banner";
import { useSession } from "@/lib/auth-client";
import { ResendVerificationButton } from "./resend-verification-button";

export function EmailVerificationBanner() {
  const { data: session, isPending } = useSession();

  if (isPending || !session?.user) return null;
  if (session.user.emailVerified) return null;

  return (
    <Banner variant="warning" role="alert">
      <Mail className="size-4 shrink-0" />
      <span className="flex-1">Verify your email to unlock bot creation</span>
      <ResendVerificationButton
        email={session.user.email}
        variant="ghost"
        className="h-auto px-2 py-1.5 text-xs font-semibold underline underline-offset-4 text-amber-500 hover:text-amber-400"
      />
    </Banner>
  );
}
