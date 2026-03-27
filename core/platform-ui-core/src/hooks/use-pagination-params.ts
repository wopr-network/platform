"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

export function usePaginationParams(pageSize = 20) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const raw = searchParams.get("page");
  const page = raw ? Math.max(1, parseInt(raw, 10) || 1) : 1;
  const offset = (page - 1) * pageSize;

  const setPage = useCallback(
    (newPage: number) => {
      const params = new URLSearchParams(searchParams.toString());
      if (newPage <= 1) {
        params.delete("page");
      } else {
        params.set("page", String(newPage));
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  return { page, setPage, offset } as const;
}
