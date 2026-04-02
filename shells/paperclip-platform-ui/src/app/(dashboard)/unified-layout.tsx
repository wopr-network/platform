"use client";

import { SidecarFrame } from "@core/components/sidecar-frame";
import { UnifiedSidebarContent } from "@core/components/unified-sidebar";
import { SidecarBridgeProvider } from "@core/hooks/use-sidecar-bridge";
import { listInstances } from "@core/lib/api";
import { getRouteType } from "@core/lib/sidecar-routes";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import NewPaperclipInstancePage from "./instances/new/page";

export function UnifiedLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const routeType = getRouteType(pathname);
  const [instanceName, setInstanceName] = useState<string | null | undefined>(undefined); // undefined = loading

  useEffect(() => {
    let cancelled = false;
    listInstances()
      .then((instances) => {
        if (!cancelled) {
          const running = instances.find((i) => i.status === "running") ?? instances[0];
          setInstanceName(running?.name ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) setInstanceName(null);
      });
    return () => { cancelled = true; };
  }, []);

  // Loading state
  if (instanceName === undefined) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <div className="animate-pulse text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // No instance — full-screen CEO onboarding chat, no sidebar
  if (!instanceName) {
    return (
      <div className="h-dvh bg-background text-foreground">
        <NewPaperclipInstancePage />
        <Toaster position="top-right" richColors />
      </div>
    );
  }

  // Has instance — unified layout with sidebar + iframe
  return (
    <SidecarBridgeProvider>
      <div className="flex h-dvh bg-background text-foreground">
        {/* Sidebar */}
        <aside className="hidden w-64 shrink-0 border-r border-sidebar-border bg-sidebar md:flex md:flex-col">
          <UnifiedSidebarContent />
        </aside>

        {/* Content area: iframe OR native page */}
        <div className="flex flex-1 flex-col min-w-0">
          {/* Sidecar iframe — always mounted via /_sidecar/ proxy (hidden when native route) */}
          <SidecarFrame instanceName={instanceName} />

          {/* Native page content — hidden when iframe route */}
          <div className="flex-1 overflow-auto" style={{ display: routeType === "native" ? "block" : "none" }}>
            {children}
          </div>
        </div>

        <Toaster position="top-right" richColors />
      </div>
    </SidecarBridgeProvider>
  );
}
