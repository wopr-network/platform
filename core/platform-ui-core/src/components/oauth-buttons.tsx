"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { API_BASE_URL } from "@/lib/api-config";
import { signIn } from "@/lib/auth-client";

const providerLabels: Record<string, string> = {
  github: "GitHub",
  discord: "Discord",
  google: "Google",
};

interface OAuthButtonsProps {
  callbackUrl?: string;
  productSlug?: string;
}

export function OAuthButtons({ callbackUrl = "/", productSlug }: OAuthButtonsProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [enabledProviders, setEnabledProviders] = useState<string[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Don't pass slug — let the server resolve from Origin header
    const url = productSlug
      ? `${API_BASE_URL}/auth/providers?slug=${encodeURIComponent(productSlug)}`
      : `${API_BASE_URL}/auth/providers`;
    fetch(url)
      .then((r) => r.json())
      .then((data) => setEnabledProviders(Array.isArray(data) ? data : []))
      .catch(() => setEnabledProviders([]))
      .finally(() => setIsLoading(false));
  }, [productSlug]);

  async function handleOAuth(provider: string) {
    setLoading(provider);
    try {
      const absoluteCallback = callbackUrl.startsWith("http") ? callbackUrl : `${window.location.origin}${callbackUrl}`;
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
        <span className="mx-3 text-xs uppercase tracking-wider text-muted-foreground">or continue with</span>
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
