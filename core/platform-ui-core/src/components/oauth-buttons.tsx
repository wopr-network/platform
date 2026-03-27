"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { signIn } from "@/lib/auth-client";
import { trpc } from "@/lib/trpc";

const providerLabels: Record<string, string> = {
  github: "GitHub",
  discord: "Discord",
  google: "Google",
};

interface OAuthButtonsProps {
  callbackUrl?: string;
}

export function OAuthButtons({ callbackUrl = "/" }: OAuthButtonsProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const { data: enabledProviders, isLoading } = trpc.authSocial.enabledSocialProviders.useQuery(
    undefined,
    { staleTime: Number.POSITIVE_INFINITY },
  );

  async function handleOAuth(provider: string) {
    setLoading(provider);
    try {
      const absoluteCallback = callbackUrl.startsWith("http")
        ? callbackUrl
        : `${window.location.origin}${callbackUrl}`;
      await signIn.social({
        provider,
        callbackURL: absoluteCallback,
      });
    } catch {
      // signIn.social redirects on success; failure here means the redirect didn't happen
    } finally {
      setLoading(null);
    }
  }

  if (isLoading || !enabledProviders?.length) {
    return null;
  }

  return (
    <>
      <div className="relative my-4 flex items-center">
        <Separator className="flex-1" />
        <span className="mx-3 text-xs uppercase tracking-wider text-muted-foreground">
          or continue with
        </span>
        <Separator className="flex-1" />
      </div>
      <div className="flex flex-col gap-2">
        {enabledProviders.map((id: string) => (
          <Button
            key={id}
            variant="outline"
            className="w-full border-terminal/30 hover:border-terminal hover:bg-terminal/5 hover:text-terminal"
            disabled={loading !== null}
            onClick={() => handleOAuth(id)}
          >
            {loading === id ? (
              <span className="inline-flex items-center gap-1">
                CONNECTING
                <span className="h-4 w-1.5 animate-pulse bg-terminal" />
              </span>
            ) : (
              `Continue with ${providerLabels[id] ?? id}`
            )}
          </Button>
        ))}
      </div>
    </>
  );
}
