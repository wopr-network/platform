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
  const { data, isPending } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!isPending && !data?.session) {
      const callback = callbackUrl || window.location.pathname;
      router.replace(`/login?callbackUrl=${encodeURIComponent(callback)}`);
    }
  }, [isPending, data, router, callbackUrl]);

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
    isAdmin: auth.user?.role === "platform_admin",
  };
}
