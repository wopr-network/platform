"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { getPagePrompt } from "@/lib/page-prompts";
import { trpc } from "@/lib/trpc";

/**
 * Sends the current page context to the platform whenever the route changes.
 * Call once in the dashboard layout.
 */
export function usePageContext(): void {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);
  const { mutate } = trpc.pageContext.update.useMutation();

  useEffect(() => {
    if (!pathname || pathname === lastPath.current) return;
    lastPath.current = pathname;

    const pagePrompt = getPagePrompt(pathname);
    mutate({ currentPage: pathname, pagePrompt });
  }, [pathname, mutate]);
}
