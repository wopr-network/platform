"use client";

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import { fromSidecarPath, getRouteType } from "@/lib/sidecar-routes";

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
  const initialForwardSentRef = useRef(false);
  // Capture the shell's initial path at mount time, before the iframe's
  // first `routeChanged` can flip window.location (which happens when the
  // sidecar's own root redirect fires — typically well before `ready`).
  // Reading window.location.pathname inside the `ready` handler is racy;
  // this ref is the source of truth for forwarding.
  const initialPathRef = useRef<string>(
    typeof window === "undefined" ? "/" : window.location.pathname + window.location.search,
  );
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
          setReady(true);
          // Forward the shell's current deep path into the sidecar on first
          // load. Without this, a refresh/bookmark of /issues/IRA-10 would
          // show the sidecar's default /{company}/dashboard. Guarded so
          // that an iframe reload (which re-fires `ready`) doesn't re-send
          // whatever pathname happens to be current at reload time.
          if (!initialForwardSentRef.current) {
            initialForwardSentRef.current = true;
            const initialPath = initialPathRef.current;
            // Use the pathname *without* the search when checking route type —
            // that's what the prefix list matches against. See the ref's
            // declaration for why we can't re-read window.location here.
            const pathname = initialPath.split("?")[0] ?? initialPath;
            // Skip /dashboard — the sidecar's own root redirect sends the
            // user to /{company}/dashboard with the correct company. Posting
            // navigate("/dashboard") would make the sidecar's react-router
            // match :companyPrefix="dashboard" and fall back to
            // "Company not found" on sidecar versions that lack an
            // UnprefixedBoardRedirect for this path.
            if (getRouteType(pathname) === "iframe" && pathname !== "/dashboard") {
              postToSidecar({ type: "navigate", path: initialPath });
            }
          }
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
  }, [postToSidecar]);

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
