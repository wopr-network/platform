"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { useSession } from "@/lib/auth-client";
import { registerWebMCPTools } from "@/lib/webmcp/register";

/**
 * Hook that registers WebMCP tools when the user is authenticated.
 *
 * Call this once in the dashboard layout (or root authenticated layout).
 * It's safe to call multiple times -- registration is idempotent
 * (guarded by a ref).
 */
export function useWebMCP(): void {
  const { data: session } = useSession();
  const registeredRef = useRef(false);
  const router = useRouter();

  const confirm = useCallback(
    (message: string): Promise<boolean> => Promise.resolve(window.confirm(message)),
    [],
  );

  useEffect(() => {
    const isAuthenticated = session?.user != null;

    if (!isAuthenticated) {
      registeredRef.current = false;
    }

    if (registeredRef.current) return;

    const registered = registerWebMCPTools(isAuthenticated, confirm, { router });

    if (registered) {
      registeredRef.current = true;
    }
  }, [session, confirm, router]);
}
