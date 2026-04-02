"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useSidecarBridge } from "@/hooks/use-sidecar-bridge";
import { getRouteType } from "@/lib/sidecar-routes";

export function SidecarFrame() {
  const { ready, setIframeRef, navigate } = useSidecarBridge();
  const pathname = usePathname();
  const iframeElRef = useRef<HTMLIFrameElement>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const initialPathSent = useRef(false);
  const routeType = getRouteType(pathname);
  const isVisible = routeType === "iframe";

  // Register iframe ref with bridge
  useEffect(() => {
    setIframeRef(iframeElRef.current);
    return () => setIframeRef(null);
  }, [setIframeRef]);

  // Send initial path when sidecar reports ready
  useEffect(() => {
    if (ready && !initialPathSent.current && isVisible) {
      initialPathSent.current = true;
      navigate(pathname);
    }
  }, [ready, isVisible, pathname, navigate]);

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
        src="/_sidecar/"
        title="Paperclip"
        className="h-full w-full border-0"
        onLoad={() => setIframeLoaded(true)}
        allow="clipboard-write"
      />
    </div>
  );
}
