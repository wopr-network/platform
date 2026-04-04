"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/lib/auth-client";
import { getBrandConfig } from "@/lib/brand-config";
import { sanitizeRedirectUrl } from "@/lib/utils";

/**
 * Redirects authenticated users away from auth pages.
 * Checks callbackUrl param first, falls back to brand homePath.
 */
export function AuthRedirect() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!isPending && session) {
      const callback = searchParams.get("callbackUrl");
      const homePath = getBrandConfig().homePath ?? "/dashboard";
      router.replace(callback ? sanitizeRedirectUrl(callback) : homePath);
    }
  }, [isPending, session, router, searchParams]);

  return null;
}
