"use client";

import { useMemo } from "react";
import type { Organization, OrgMember } from "@/lib/api";
import { useSession } from "@/lib/auth-client";

/**
 * Derives the current user's role from an already-fetched org object.
 * Does NOT fetch org data — avoids duplicate requests and role-flash.
 * Pass the org from the page's own load() call.
 */
export function useMyOrgRole(org: Organization | null): OrgMember["role"] | null {
  const { data: session } = useSession();

  return useMemo(() => {
    if (!org || !session?.user?.id) return null;

    const me = org.members?.find(
      (m: OrgMember) => m.userId === session.user.id || m.email === session.user.email,
    );
    return me?.role ?? null;
  }, [org, session?.user?.id, session?.user?.email]);
}

/**
 * Returns true if the current user is an admin or owner of the given org.
 * Pass the org from the page's own load() call.
 */
export function useIsAdminOrOwner(org: Organization | null): boolean {
  const role = useMyOrgRole(org);
  return role === "admin" || role === "owner";
}
