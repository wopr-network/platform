"use client";

import { SidecarFrame } from "@core/components/sidecar-frame";
import { UnifiedSidebarContent } from "@core/components/unified-sidebar";
import { SidecarBridgeProvider } from "@core/hooks/use-sidecar-bridge";
import { getRouteType } from "@core/lib/sidecar-routes";
import { usePathname } from "next/navigation";
import { Toaster } from "sonner";

export function UnifiedLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const routeType = getRouteType(pathname);

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
          <SidecarFrame />

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
