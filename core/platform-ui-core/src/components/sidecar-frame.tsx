"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useSidecarBridge } from "@/hooks/use-sidecar-bridge";
import { getRouteType } from "@/lib/sidecar-routes";

/**
 * Build the iframe src. For deep-link paths (non-/dashboard iframe routes),
 * pass the path as an `initial-path` query so the sidecar's root redirect
 * can land on the right page directly instead of racing with the shell's
 * postMessage forwarding. See CompanyRootRedirect on the sidecar side.
 */
function buildIframeSrc(): string {
  if (typeof window === "undefined") return "/_sidecar/";
  const pathname = window.location.pathname;
  if (getRouteType(pathname) !== "iframe" || pathname === "/dashboard") return "/_sidecar/";
  const initialPath = pathname + window.location.search;
  return `/_sidecar/?initial-path=${encodeURIComponent(initialPath)}`;
}

export function SidecarFrame() {
  // iframe loads /_sidecar/ — core API's tenant-proxy resolves the user's instance
  const { setIframeRef, navigate } = useSidecarBridge();
  const pathname = usePathname();
  const iframeElRef = useRef<HTMLIFrameElement>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  // Stable across re-renders: computed once from the shell's initial URL so
  // the iframe doesn't reload when the shell URL changes post-routeChanged.
  const [iframeSrc] = useState(buildIframeSrc);

  const routeType = getRouteType(pathname);
  const isVisible = routeType === "iframe";

  // Register iframe ref with bridge
  useEffect(() => {
    setIframeRef(iframeElRef.current);
    return () => setIframeRef(null);
  }, [setIframeRef]);

  // Handle browser back/forward
  useEffect(() => {
    function onPopState() {
      const newPath = window.location.pathname;
      if (getRouteType(newPath) === "iframe") {
        navigate(newPath);
      }
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [navigate]);

  return (
    <div className="relative flex-1 min-h-0" style={{ display: isVisible ? "flex" : "none" }}>
      {/* Loading skeleton until sidecar posts "ready" */}
      {isVisible && !iframeLoaded && (
        <div className="absolute inset-0 flex flex-col gap-4 p-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
          <div className="flex gap-4 mt-4">
            <Skeleton className="h-32 w-64" />
            <Skeleton className="h-32 w-64" />
            <Skeleton className="h-32 w-64" />
          </div>
        </div>
      )}
      <iframe
        ref={iframeElRef}
        src={iframeSrc}
        title="Paperclip"
        className="h-full w-full border-0"
        onLoad={() => setIframeLoaded(true)}
        allow="clipboard-write"
      />
    </div>
  );
}
