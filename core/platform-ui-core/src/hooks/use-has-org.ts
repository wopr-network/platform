"use client";

import { useEffect, useState } from "react";
import { getOrganization } from "@/lib/org-api";

export function useHasOrg(): { hasOrg: boolean; loading: boolean } {
  const [hasOrg, setHasOrg] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getOrganization()
      .then(() => setHasOrg(true))
      .catch(() => setHasOrg(false))
      .finally(() => setLoading(false));
  }, []);

  return { hasOrg, loading };
}
