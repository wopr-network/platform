"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { trpcVanilla } from "@/lib/trpc";

/**
 * Module-level tenant ID, set by TenantProvider from the server-injected value.
 * Read by getActiveTenantId() for non-React callers (apiFetch, tRPC, SSE hooks).
 */
let _activeTenantId = "";

/**
 * Set the active tenant ID from server context (called by TenantProvider on mount
 * and on tenant switch). Also used by tests.
 *
 * @internal Not for production code. Import in tests only.
 */
export function setServerTenantId(tenantId: string): void {
  _activeTenantId = tenantId;
}

/**
 * Read the active tenant ID.
 * Used by non-React code (apiFetch, trpc client) to inject X-Tenant-Id headers.
 */
export function getActiveTenantId(): string {
  return _activeTenantId;
}

/** Persist tenant selection via HttpOnly cookie (server-side). */
async function persistTenantSelection(tenantId: string): Promise<void> {
  try {
    await fetch("/api/tenant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId }),
    });
  } catch {
    // Best-effort — cookie will be stale on next hard navigation but
    // in-memory state is already updated for the current session.
  }
}

export interface TenantOption {
  id: string;
  name: string;
  type: "personal" | "org";
  image?: string | null;
}

export interface TenantContextValue {
  activeTenantId: string;
  tenants: TenantOption[];
  isLoading: boolean;
  switchTenant: (tenantId: string) => void;
}

const TenantContext = createContext<TenantContextValue | null>(null);

interface TenantProviderProps {
  children: React.ReactNode;
  /** Server-injected tenant ID from the HttpOnly cookie (read in middleware → layout). */
  initialTenantId?: string;
}

export function TenantProvider({ children, initialTenantId = "" }: TenantProviderProps) {
  const { data: session, isPending: sessionPending } = useSession();
  const queryClient = useQueryClient();
  const user = session?.user;

  const [orgs, setOrgs] = useState<Array<{ id: string; name: string; image?: string | null }>>([]);
  const [orgsLoaded, setOrgsLoaded] = useState(false);
  const [activeTenantId, setActiveTenantId] = useState<string>(initialTenantId);

  // Fetch orgs once user is available
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      try {
        const result = await trpcVanilla.org.listMyOrganizations.query(undefined);
        if (!cancelled) setOrgs(result);
      } catch {
        // Endpoint may not exist yet (WOP-1000). Gracefully degrade.
      } finally {
        if (!cancelled) setOrgsLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const tenants = useMemo<TenantOption[]>(() => {
    if (!user) return [];
    const personal: TenantOption = {
      id: user.id,
      name: user.name ?? "Personal",
      type: "personal",
      image: user.image ?? null,
    };
    const orgOptions: TenantOption[] = orgs.map((o) => ({
      id: o.id,
      name: o.name,
      type: "org",
      image: o.image ?? null,
    }));
    return [personal, ...orgOptions];
  }, [user, orgs]);

  // Resolve active tenant: fall back to personal if stored value is invalid
  const resolvedTenantId = useMemo(() => {
    if (!user) return "";
    if (activeTenantId && tenants.some((t) => t.id === activeTenantId)) {
      return activeTenantId;
    }
    return user.id;
  }, [user, activeTenantId, tenants]);

  // Keep module-level var in sync with resolved value.
  // Guard on truthy value so an initial render with user=null (resolvedTenantId="")
  // does not overwrite a value already set by switchTenant or SSR hydration.
  useEffect(() => {
    if (resolvedTenantId) {
      _activeTenantId = resolvedTenantId;
    }
  }, [resolvedTenantId]);

  const switchTenant = useCallback(
    (tenantId: string) => {
      setActiveTenantId(tenantId);
      _activeTenantId = tenantId;
      persistTenantSelection(tenantId);
      queryClient.invalidateQueries();
    },
    [queryClient],
  );

  const isLoading = sessionPending || (!orgsLoaded && !!user);

  const value = useMemo<TenantContextValue>(
    () => ({
      activeTenantId: resolvedTenantId,
      tenants,
      isLoading,
      switchTenant,
    }),
    [resolvedTenantId, tenants, isLoading, switchTenant],
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    throw new Error("useTenant must be used within a TenantProvider");
  }
  return ctx;
}
