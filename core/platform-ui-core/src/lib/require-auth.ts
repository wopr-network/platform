"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/lib/auth-client";

/**
 * Hook for pages that require authentication.
 * Redirects to /login if no session. Returns session data when authed.
 *
 * Usage:
 *   const { user, session, isPending } = useRequireAuth();
 *   if (isPending) return <Loading />;
 */
export function useRequireAuth(callbackUrl?: string) {
  const { data, isPending, error } = useSession();
  const router = useRouter();

  useEffect(() => {
    // Diagnostic logging — remove once redirect loop is resolved
    if (!isPending) {
      console.warn("[useRequireAuth] session check complete", {
        hasSession: !!data?.session,
        hasUser: !!data?.user,
        userId: data?.user?.id ?? null,
        sessionId: data?.session?.id?.slice(0, 8) ?? null,
        error: error ?? null,
        pathname: window.location.pathname,
        cookies: document.cookie
          .split(";")
          .map((c) => c.trim().split("=")[0])
          .filter((n) => n.startsWith("better-auth")),
      });
    }

    if (!isPending && !data?.session) {
      const callback = callbackUrl || window.location.pathname;
      console.warn("[useRequireAuth] NO SESSION — redirecting to /login", { callback });
      router.replace(`/login?reason=expired&callbackUrl=${encodeURIComponent(callback)}`);
    }
  }, [isPending, data, router, callbackUrl, error]);

  return {
    user: data?.user ?? null,
    session: data?.session ?? null,
    isPending,
    isAuthed: !!data?.session,
  };
}

/**
 * Hook for pages that require platform_admin role.
 * Redirects to / if not admin.
 */
export function useRequireAdmin() {
  const auth = useRequireAuth();
  const router = useRouter();

  useEffect(() => {
    if (!auth.isPending && auth.user && (auth.user as Record<string, unknown>).role !== "platform_admin") {
      router.replace("/");
    }
  }, [auth.isPending, auth.user, router]);

  return {
    ...auth,
    isAdmin: (auth.user as Record<string, unknown> | null)?.role === "platform_admin",
  };
}
// retry
