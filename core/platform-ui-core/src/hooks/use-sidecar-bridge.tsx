"use client";

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import { fromSidecarPath } from "@/lib/sidecar-routes";

// Types matching the sidecar's postMessage protocol

export interface SidebarAgent {
  id: string;
  name: string;
  status: string;
  icon: string | null;
  liveRun: boolean;
  liveRunCount: number;
  pauseReason: string | null;
}

export interface SidebarProject {
  id: string;
  name: string;
  urlKey: string;
  color: string | null;
}

export interface SidecarSidebarData {
  companyName: string;
  companyIssuePrefix: string;
  brandColor: string | null;
  projects: SidebarProject[];
  agents: SidebarAgent[];
  inboxBadge: number;
  failedRuns: number;
  liveRunCount: number;
  /** Whether the Projects feature is exposed in this deployment. Older
   * sidecar versions don't send this — undefined means "fall back to
   * showing the section so we don't break standalone installs". */
  showProjects?: boolean;
}

interface SidecarBridgeState {
  ready: boolean;
  sidebarData: SidecarSidebarData | null;
  currentSidecarPath: string | null;
  navigate: (path: string) => void;
  command: (action: string) => void;
  setIframeRef: (iframe: HTMLIFrameElement | null) => void;
}

const SidecarBridgeContext = createContext<SidecarBridgeState>({
  ready: false,
  sidebarData: null,
  currentSidecarPath: null,
  navigate: () => {},
  command: () => {},
  setIframeRef: () => {},
});

export function useSidecarBridge() {
  return useContext(SidecarBridgeContext);
}

export function SidecarBridgeProvider({ children }: { children: ReactNode }) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  const [sidebarData, setSidebarData] = useState<SidecarSidebarData | null>(null);
  const [currentSidecarPath, setCurrentSidecarPath] = useState<string | null>(null);

  const setIframeRef = useCallback((iframe: HTMLIFrameElement | null) => {
    iframeRef.current = iframe;
  }, []);

  const postToSidecar = useCallback((message: unknown) => {
    if (!iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(message, window.location.origin);
  }, []);

  const navigate = useCallback(
    (path: string) => {
      postToSidecar({ type: "navigate", path });
    },
    [postToSidecar],
  );

  const command = useCallback(
    (action: string) => {
      postToSidecar({ type: "command", action });
    },
    [postToSidecar],
  );

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || typeof data.type !== "string") return;

      switch (data.type) {
        case "ready": {
          // Initial deep-link is now passed through the iframe src
          // (`?initial-path=…` → SidecarFrame). Forwarding on ready would
          // race with the sidecar's CompanyRootRedirect Navigate and
          // sometimes lose the deep link.
          setReady(true);
          break;
        }
        case "routeChanged": {
          const platformPath = fromSidecarPath(data.path);
          setCurrentSidecarPath(platformPath);
          const current = window.location.pathname + window.location.search;
          if (current !== platformPath) {
            window.history.replaceState(null, "", platformPath);
          }
          break;
        }
        case "sidebarData":
          setSidebarData(data.payload);
          break;
        case "toast":
          import("sonner").then(({ toast }) => {
            if (data.level === "error") toast.error(data.message);
            else if (data.level === "success") toast.success(data.message);
            else toast.info(data.message);
          });
          break;
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <SidecarBridgeContext.Provider
      value={{
        ready,
        sidebarData,
        currentSidecarPath,
        navigate,
        command,
        setIframeRef,
      }}
    >
      {children}
    </SidecarBridgeContext.Provider>
  );
}
