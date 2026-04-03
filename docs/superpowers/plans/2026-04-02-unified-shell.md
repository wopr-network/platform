# Unified Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the platform dashboard and sidecar UI into one app — one sidebar, one experience, no iframe visible to the user.

**Architecture:** Everything on one domain. No subdomains. Platform middleware proxies `/_sidecar/*` to the instance's internal URL. A same-origin iframe loads `/_sidecar/` and renders headless sidecar content. Bidirectional postMessage syncs navigation and sidebar data. Platform sidebar renders sidecar nav items (agents, projects, issues) from data pushed by the sidecar. Platform pages (billing, settings) render natively with iframe hidden via `display:none`. Users see `runpaperclip.com/agents/ceo` — never a subdomain.

**Tech Stack:** Next.js 16 (platform shell), Vite + React Router (sidecar), postMessage API, TypeScript

**Spec:** `docs/superpowers/specs/2026-04-02-unified-shell-design.md`

---

## File Map

### New Files

| File | Responsibility |
|------|---------------|
| `sidecars/paperclip/ui/src/components/EmbeddedBridge.tsx` | Sidecar-side postMessage bridge: posts routeChanged, sidebarData, toast, ready; listens for navigate and command messages from parent. Always mounted (sidecar is headless-only). |
| `core/platform-ui-core/src/lib/sidecar-routes.ts` | Route type map: which paths are iframe vs native, path prefix matching |
| `core/platform-ui-core/src/hooks/use-sidecar-bridge.ts` | React context + hook: stores sidecarData, routeChanged state, exposes navigate/command methods |
| `core/platform-ui-core/src/components/sidecar-frame.tsx` | iframe host component: mounts iframe, manages postMessage listener, visibility toggle, loading state |
| `core/platform-ui-core/src/components/unified-sidebar.tsx` | Merged sidebar: static platform items + dynamic sidecar items (projects, agents, badges) |
| `shells/paperclip-platform-ui/src/app/(dashboard)/unified-layout.tsx` | New dashboard layout: wraps SidecarFrame + UnifiedSidebar + native page content |

### Modified Files

| File | Change |
|------|--------|
| `sidecars/paperclip/ui/src/App.tsx` | Remove standalone auth routes. Mount EmbeddedBridge unconditionally. Sidecar is headless-only. |
| `sidecars/paperclip/ui/src/components/Layout.tsx` | Remove all chrome permanently: Sidebar, CompanyRail, BreadcrumbBar, MobileBottomNav, CommandPalette, ToastViewport. Render only Outlet + PropertiesPanel. |
| `core/platform-ui-core/src/proxy.ts` | Add `/_sidecar/*` proxy rule forwarding to instance internal URL with auth headers |
| `shells/paperclip-platform-ui/src/app/(dashboard)/layout.tsx` | Switch from re-exporting core layout to using unified-layout |
| `shells/paperclip-platform-ui/src/app/page.tsx` | Root route: check for instance, show onboarding or redirect to dashboard |

### Removed Files (Task 9)

| File | Reason |
|------|--------|
| `shells/paperclip-platform-ui/src/app/(dashboard)/instances/page.tsx` | No more instance list |
| `shells/paperclip-platform-ui/src/app/(dashboard)/instances/[id]/page.tsx` | No more instance detail |
| `shells/paperclip-platform-ui/src/app/(dashboard)/instances/[id]/paperclip-instance-detail.tsx` | No more instance detail |
| `shells/paperclip-platform-ui/src/components/paperclip-dashboard.tsx` | Replaced by sidecar dashboard in iframe |
| `shells/paperclip-platform-ui/src/components/paperclip-card.tsx` | No more instance cards |
| `shells/paperclip-platform-ui/src/components/add-paperclip-card.tsx` | Replaced by onboarding chat as default route |

---

## Task 1: Sidecar Proxy Middleware (Platform)

**Files:**
- Modify: `core/platform-ui-core/src/proxy.ts`

Add a `/_sidecar/*` proxy rule. When the platform receives a request to `/_sidecar/anything`, it proxies to the user's instance internal URL (looked up from the instance record). Auth headers are attached by the proxy, same as `hosted_proxy` does today.

- [ ] **Step 1: Add /_sidecar proxy route to middleware**

In `core/platform-ui-core/src/proxy.ts`, add a handler before the default CSP logic. When `pathname.startsWith("/_sidecar")`:

```ts
// At the top of the middleware function, after pathname extraction:
if (pathname.startsWith("/_sidecar")) {
  // Strip the /_sidecar prefix and proxy to the instance backend.
  // The instance URL is resolved from the user's session/tenant context.
  // For now, read from INSTANCE_INTERNAL_URL env var (set by provisioning).
  // Future: look up from instance record via tenant ID.
  const instanceUrl = process.env.INSTANCE_INTERNAL_URL;
  if (!instanceUrl) {
    return NextResponse.json({ error: "No instance configured" }, { status: 502 });
  }

  const targetPath = pathname.replace(/^\/_sidecar/, "") || "/";
  const targetUrl = new URL(targetPath + request.nextUrl.search, instanceUrl);

  const proxyHeaders = new Headers(request.headers);
  // Inject auth: forward the user ID from session cookie
  const tenantCookie = request.cookies.get(TENANT_COOKIE_NAME);
  if (tenantCookie?.value) {
    proxyHeaders.set("x-tenant-id", tenantCookie.value);
  }
  // hosted_proxy auth header — instance trusts this
  proxyHeaders.set("x-paperclip-deployment-mode", "hosted_proxy");

  return NextResponse.rewrite(targetUrl, {
    request: { headers: proxyHeaders },
  });
}
```

- [ ] **Step 2: Relax frame-ancestors for /_sidecar responses**

The current CSP has `frame-ancestors 'none'` which blocks iframes. For `/_sidecar` responses, the CSP should allow `frame-ancestors 'self'`. Update the `buildCsp` function to accept a parameter:

```ts
function buildCsp(nonce: string, requestUrl?: string, requestHost?: string, allowSelfFrame = false): string {
  // ... existing directives ...
  return [
    // ... existing entries ...
    allowSelfFrame ? "frame-ancestors 'self'" : "frame-ancestors 'none'",
    // ... rest ...
  ].join("; ");
}
```

And in the main middleware path, pass `allowSelfFrame: true` for non-`_sidecar` routes that serve the iframe container page. Actually, the `/_sidecar` responses come from the instance backend which has its own CSP. The platform's CSP applies to the parent page. The parent page needs `frame-src 'self'` (already covered by same-origin). So we just need to ensure the iframe content from the proxy doesn't get the `frame-ancestors 'none'` header. Since `NextResponse.rewrite` forwards the target's headers, the instance backend's CSP controls that.

If the instance backend sends `frame-ancestors 'none'`, we strip it in the proxy:

```ts
// After the rewrite, the response headers come from the instance.
// We'll handle this in a Next.js middleware rewrite — the instance
// server should be configured to allow frame-ancestors 'self' in hosted mode.
```

- [ ] **Step 3: Commit**

```bash
cd ~/platform
git add core/platform-ui-core/src/proxy.ts
git commit -m "feat(platform): add /_sidecar proxy route to middleware"
```

---

## Task 2: EmbeddedBridge Component (Sidecar)

**Files:**
- Create: `sidecars/paperclip/ui/src/components/EmbeddedBridge.tsx`

This is the core postMessage bridge inside the sidecar. It:
- Posts `ready` on mount
- Posts `routeChanged` on every navigation
- Posts `sidebarData` when agents/projects/inbox/liveRuns change
- Posts `toast` events (intercepts sonner)
- Listens for `navigate` and `command` messages from parent

- [ ] **Step 1: Define the postMessage types**

```ts
// sidecars/paperclip/ui/src/components/EmbeddedBridge.tsx

import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { agentsApi } from "../api/agents";
import { projectsApi } from "../api/projects";
import { heartbeatsApi } from "../api/heartbeats";
import { queryKeys } from "../lib/queryKeys";
import { useInboxBadge } from "../hooks/useInboxBadge";
import type { Agent, Project } from "@paperclipai/shared";

// --- Types for the postMessage protocol ---

/** Messages sent FROM sidecar TO platform */
export type SidecarMessage =
  | { type: "ready" }
  | { type: "routeChanged"; path: string; title: string }
  | {
      type: "sidebarData";
      payload: {
        companyName: string;
        brandColor: string | null;
        projects: Array<{ id: string; name: string; issuePrefix: string; color: string | null }>;
        agents: Array<{
          id: string;
          name: string;
          status: string;
          icon: string | null;
          liveRun: boolean;
          liveRunCount: number;
          pauseReason: string | null;
        }>;
        inboxBadge: number;
        failedRuns: number;
        liveRunCount: number;
      };
    }
  | { type: "toast"; level: "success" | "error" | "info"; message: string };

/** Messages sent FROM platform TO sidecar */
export type PlatformMessage =
  | { type: "navigate"; path: string }
  | { type: "command"; action: "openNewIssue" | "openCommandPalette" | "openNewAgent" | "openNewProject" | "openNewGoal" }
  | { type: "toast"; level: "success" | "error" | "info"; message: string };
```

- [ ] **Step 2: Implement the bridge component**

```ts
// (continuing in the same file)

function postToParent(message: SidecarMessage) {
  // Same-origin iframe — post to parent with own origin
  if (typeof window === "undefined" || window.parent === window) return;
  window.parent.postMessage(message, window.location.origin);
}

export function EmbeddedBridge() {
  const location = useLocation();
  const navigate = useNavigate();
  const { selectedCompany, selectedCompanyId } = useCompany();
  const { openNewIssue, openNewProject, openNewGoal, openNewAgent } = useDialog();
  const readySent = useRef(false);
  const inboxBadge = useInboxBadge(selectedCompanyId);

  // --- Queries: same data sources as Sidebar/SidebarAgents/SidebarProjects ---
  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(selectedCompanyId!),
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 10_000,
  });

  // --- Post "ready" once on mount ---
  useEffect(() => {
    if (!readySent.current) {
      readySent.current = true;
      postToParent({ type: "ready" });
    }
  }, []);

  // --- Post routeChanged on every navigation ---
  useEffect(() => {
    postToParent({
      type: "routeChanged",
      path: location.pathname + location.search,
      title: document.title,
    });
  }, [location.pathname, location.search]);

  // --- Post sidebarData when any source changes ---
  useEffect(() => {
    if (!selectedCompany) return;

    const liveCountByAgent = new Map<string, number>();
    for (const run of liveRuns ?? []) {
      liveCountByAgent.set(run.agentId, (liveCountByAgent.get(run.agentId) ?? 0) + 1);
    }

    const visibleAgents = (agents ?? []).filter((a: Agent) => a.status !== "terminated");
    const visibleProjects = (projects ?? []).filter((p: Project) => !p.archivedAt);

    postToParent({
      type: "sidebarData",
      payload: {
        companyName: selectedCompany.name,
        brandColor: selectedCompany.brandColor ?? null,
        projects: visibleProjects.map((p: Project) => ({
          id: p.id,
          name: p.name,
          issuePrefix: (p as { issuePrefix?: string }).issuePrefix ?? "",
          color: p.color ?? null,
        })),
        agents: visibleAgents.map((a: Agent) => ({
          id: a.id,
          name: a.name,
          status: a.status,
          icon: a.icon ?? null,
          liveRun: (liveCountByAgent.get(a.id) ?? 0) > 0,
          liveRunCount: liveCountByAgent.get(a.id) ?? 0,
          pauseReason: a.pauseReason ?? null,
        })),
        inboxBadge: inboxBadge.inbox,
        failedRuns: inboxBadge.failedRuns,
        liveRunCount: liveRuns?.length ?? 0,
      },
    });
  }, [selectedCompany, agents, projects, liveRuns, inboxBadge]);

  // --- Listen for commands from platform ---
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      // Same-origin: just verify it's from our origin
      if (event.origin !== window.location.origin) return;
      const data = event.data as PlatformMessage;

      if (data.type === "navigate") {
        navigate(data.path);
      } else if (data.type === "command") {
        switch (data.action) {
          case "openNewIssue":
            openNewIssue();
            break;
          case "openNewAgent":
            openNewAgent();
            break;
          case "openNewProject":
            openNewProject();
            break;
          case "openNewGoal":
            openNewGoal();
            break;
          case "openCommandPalette":
            document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
            break;
        }
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [navigate, openNewIssue, openNewAgent, openNewProject, openNewGoal]);

  return null; // No visual output
}
```

- [ ] **Step 3: Commit**

```bash
cd ~/platform
git add sidecars/paperclip/ui/src/components/EmbeddedBridge.tsx
git commit -m "feat(sidecar): add EmbeddedBridge postMessage component"
```

---

## Task 3: Strip Sidecar to Headless Content Renderer

**Files:**
- Modify: `sidecars/paperclip/ui/src/App.tsx`
- Modify: `sidecars/paperclip/ui/src/components/Layout.tsx`

The sidecar is now headless-only. No standalone mode. Remove all chrome permanently and mount EmbeddedBridge unconditionally.

- [ ] **Step 1: Simplify App.tsx — remove standalone routes, mount EmbeddedBridge**

In `sidecars/paperclip/ui/src/App.tsx`:

1. Remove imports for `AuthPage`, `BoardClaimPage`, `CliAuthPage`, `InviteLandingPage`
2. Import `EmbeddedBridge` from `./components/EmbeddedBridge`
3. Remove the standalone auth routes from the `<Routes>`:

```tsx
// REMOVE these routes:
// <Route path="auth" element={<AuthPage />} />
// <Route path="board-claim/:token" element={<BoardClaimPage />} />
// <Route path="cli-auth/:id" element={<CliAuthPage />} />
// <Route path="invite/:token" element={<InviteLandingPage />} />
```

4. Remove the `CloudAccessGate` wrapper — platform handles auth. The routes inside it become top-level.

5. Remove the `OnboardingWizard` conditional — platform handles onboarding.

6. Mount `EmbeddedBridge` unconditionally at the bottom of the JSX:

```tsx
return (
  <>
    <Routes>
      <Route index element={<CompanyRootRedirect />} />
      {/* ... all the board routes, no auth gate ... */}
      <Route path=":companyPrefix" element={<Layout />}>
        {boardRoutes()}
      </Route>
      <Route path="*" element={<NotFoundPage scope="global" />} />
    </Routes>
    <EmbeddedBridge />
  </>
);
```

- [ ] **Step 2: Strip Layout.tsx to content-only**

In `sidecars/paperclip/ui/src/components/Layout.tsx`:

Remove all chrome. The Layout becomes:

```tsx
export function Layout() {
  const { companyPrefix } = useParams<{ companyPrefix: string }>();
  const { companies, loading: companiesLoading, selectedCompany } = useCompany();
  const location = useLocation();

  const matchedCompany = useMemo(() => {
    if (!companyPrefix) return null;
    return companies.find((c) => c.issuePrefix.toUpperCase() === companyPrefix.toUpperCase()) ?? null;
  }, [companies, companyPrefix]);

  const hasUnknownCompanyPrefix =
    Boolean(companyPrefix) && !companiesLoading && companies.length > 0 && !matchedCompany;

  return (
    <div className="bg-background text-foreground min-h-dvh">
      <main id="main-content" tabIndex={-1} className="h-dvh overflow-auto p-4 md:p-6">
        {hasUnknownCompanyPrefix ? (
          <NotFoundPage scope="invalid_company_prefix" requestedPrefix={companyPrefix ?? selectedCompany?.issuePrefix} />
        ) : (
          <Outlet />
        )}
      </main>
      <PropertiesPanel />
    </div>
  );
}
```

Remove imports for: `Sidebar`, `InstanceSidebar`, `CompanyRail`, `BreadcrumbBar`, `CommandPalette`, `NewIssueDialog`, `NewProjectDialog`, `NewGoalDialog`, `NewAgentDialog`, `ToastViewport`, `MobileBottomNav`, `WorktreeBanner`, `DevRestartBanner`, `useSidebar`, `useTheme`, `useKeyboardShortcuts`, `useCompanyPageMemory`.

The dialogs (`NewIssueDialog`, etc.) are triggered via postMessage from the platform. They still need to render somewhere — keep them in `App.tsx` instead:

```tsx
// In App.tsx, alongside EmbeddedBridge:
<NewIssueDialog />
<NewProjectDialog />
<NewGoalDialog />
<NewAgentDialog />
<EmbeddedBridge />
```

- [ ] **Step 3: Verify sidecar builds**

```bash
cd ~/platform/sidecars/paperclip/ui
pnpm build
```

Expected: Build succeeds with no type errors.

- [ ] **Step 4: Commit**

```bash
cd ~/platform
git add sidecars/paperclip/ui/src/App.tsx sidecars/paperclip/ui/src/components/Layout.tsx
git commit -m "feat(sidecar): strip to headless content renderer — no chrome, no standalone auth"
```

---

## Task 4: Sidecar Route Map (Platform)

**Files:**
- Create: `core/platform-ui-core/src/lib/sidecar-routes.ts`

This maps URL paths to their type (iframe vs native) so the platform knows what to render.

- [ ] **Step 1: Create the route map**

```ts
// core/platform-ui-core/src/lib/sidecar-routes.ts

export type RouteType = "iframe" | "native";

/** Iframe route prefixes — these render in the sidecar iframe */
const IFRAME_PREFIXES = [
  "/dashboard",
  "/inbox",
  "/issues",
  "/routines",
  "/goals",
  "/projects",
  "/agents",
  "/org",
  "/skills",
  "/company",
  "/approvals",
  "/activity",
  "/execution-workspaces",
  "/plugins/",
] as const;

/** Native route prefixes — these render as platform pages */
const NATIVE_PREFIXES = [
  "/billing",
  "/settings",
  "/admin",
  "/onboarding",
] as const;

/**
 * Determine whether a path should render in the sidecar iframe or as a native platform page.
 * Returns "iframe" for sidecar routes, "native" for platform routes.
 * Unknown paths default to "native".
 */
export function getRouteType(pathname: string): RouteType {
  for (const prefix of IFRAME_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return "iframe";
  }
  return "native";
}

/**
 * Convert a platform URL path to the sidecar-internal path.
 * The sidecar uses company-prefixed routes (e.g., /ACME/agents).
 * The platform strips the prefix since we navigate via postMessage
 * and the sidecar's EmbeddedBridge handles the internal routing.
 */
export function toSidecarPath(platformPath: string): string {
  // Platform paths map 1:1 to sidecar paths (the sidecar's
  // UnprefixedBoardRedirect handles adding the company prefix internally)
  return platformPath;
}

/**
 * Given a sidecar routeChanged path (which may include a company prefix like /ACME/agents/abc),
 * extract the canonical platform path (e.g., /agents/abc).
 */
export function fromSidecarPath(sidecarPath: string): string {
  // The sidecar uses /:companyPrefix/agents/... format.
  // We strip the first segment if it doesn't match a known prefix.
  const segments = sidecarPath.split("/").filter(Boolean);
  if (segments.length === 0) return "/dashboard";

  const firstSegment = `/${segments[0]}`;
  // If the first segment is a known route, return as-is
  for (const prefix of IFRAME_PREFIXES) {
    if (firstSegment === prefix || prefix.startsWith(`${firstSegment}/`)) {
      return sidecarPath;
    }
  }
  for (const prefix of NATIVE_PREFIXES) {
    if (firstSegment === prefix) return sidecarPath;
  }

  // First segment is a company prefix — strip it
  return `/${segments.slice(1).join("/")}` || "/dashboard";
}
```

- [ ] **Step 2: Commit**

```bash
cd ~/platform
git add core/platform-ui-core/src/lib/sidecar-routes.ts
git commit -m "feat(platform): add sidecar route type mapping"
```

---

## Task 5: Sidecar Bridge Hook (Platform)

**Files:**
- Create: `core/platform-ui-core/src/hooks/use-sidecar-bridge.ts`

React context that holds sidecar state and exposes communication methods.

- [ ] **Step 1: Create the bridge context and hook**

```ts
// core/platform-ui-core/src/hooks/use-sidecar-bridge.ts
"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { fromSidecarPath } from "@/lib/sidecar-routes";

// --- Types matching the sidecar's postMessage protocol ---

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
  issuePrefix: string;
  color: string | null;
}

export interface SidecarSidebarData {
  companyName: string;
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
  /** Send a navigate command to the sidecar iframe */
  navigate: (path: string) => void;
  /** Send a command (open dialog, etc.) to the sidecar iframe */
  command: (action: string) => void;
  /** Register the iframe ref for postMessage dispatch */
  setIframeRef: (iframe: HTMLIFrameElement | null) => void;
  /** The instance URL (e.g., https://acme.runpaperclip.com) */
  instanceUrl: string | null;
}

const SidecarBridgeContext = createContext<SidecarBridgeState>({
  ready: false,
  sidebarData: null,
  currentSidecarPath: null,
  navigate: () => {},
  command: () => {},
  setIframeRef: () => {},
  instanceUrl: null,
});

export function useSidecarBridge() {
  return useContext(SidecarBridgeContext);
}

export function SidecarBridgeProvider({
  instanceUrl,
  children,
}: {
  instanceUrl: string | null;
  children: ReactNode;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  const [sidebarData, setSidebarData] = useState<SidecarSidebarData | null>(null);
  const [currentSidecarPath, setCurrentSidecarPath] = useState<string | null>(null);

  // Same-origin: the sidecar is proxied through /_sidecar/ on our domain
  const instanceOrigin = typeof window !== "undefined" ? window.location.origin : null;

  const setIframeRef = useCallback((iframe: HTMLIFrameElement | null) => {
    iframeRef.current = iframe;
  }, []);

  const postToSidecar = useCallback(
    (message: unknown) => {
      if (!iframeRef.current?.contentWindow || !instanceOrigin) return;
      iframeRef.current.contentWindow.postMessage(message, instanceOrigin);
    },
    [instanceOrigin],
  );

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

  // Listen for messages from the sidecar iframe
  useEffect(() => {
    if (!instanceOrigin) return;

    function onMessage(event: MessageEvent) {
      if (event.origin !== instanceOrigin) return;
      const data = event.data;
      if (!data || typeof data.type !== "string") return;

      switch (data.type) {
        case "ready":
          setReady(true);
          break;
        case "routeChanged": {
          const platformPath = fromSidecarPath(data.path);
          setCurrentSidecarPath(platformPath);
          // Sync browser URL bar
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
          // Forward to sonner — imported dynamically to avoid SSR issues
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
  }, [instanceOrigin]);

  return (
    <SidecarBridgeContext.Provider
      value={{ ready, sidebarData, currentSidecarPath, navigate, command, setIframeRef, instanceUrl }}
    >
      {children}
    </SidecarBridgeContext.Provider>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd ~/platform
git add core/platform-ui-core/src/hooks/use-sidecar-bridge.ts
git commit -m "feat(platform): add SidecarBridgeProvider context and hook"
```

---

## Task 6: SidecarFrame Component (Platform)

**Files:**
- Create: `core/platform-ui-core/src/components/sidecar-frame.tsx`

The iframe host component. Manages visibility, loading state, and iframe ref registration.

- [ ] **Step 1: Create the SidecarFrame component**

```tsx
// core/platform-ui-core/src/components/sidecar-frame.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useSidecarBridge } from "@/hooks/use-sidecar-bridge";
import { getRouteType } from "@/lib/sidecar-routes";
import { Skeleton } from "@/components/ui/skeleton";

export function SidecarFrame() {
  const { instanceUrl, ready, setIframeRef, navigate } = useSidecarBridge();
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

  // When sidecar reports ready + we haven't sent initial path yet
  useEffect(() => {
    if (ready && !initialPathSent.current && isVisible) {
      initialPathSent.current = true;
      navigate(pathname);
    }
  }, [ready, isVisible, pathname, navigate]);

  // When user clicks an iframe nav item, send navigate to sidecar
  // This is handled via the sidebar's onClick -> bridge.navigate(),
  // but we also need to handle browser back/forward:
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

  if (!instanceUrl) return null;

  // Same-origin proxy — no subdomain needed
  const iframeSrc = "/_sidecar/";

  return (
    <div
      className="relative flex-1 min-h-0"
      style={{ display: isVisible ? "flex" : "none" }}
    >
      {/* Loading skeleton — shown until sidecar posts "ready" */}
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
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd ~/platform
git add core/platform-ui-core/src/components/sidecar-frame.tsx
git commit -m "feat(platform): add SidecarFrame iframe host component"
```

---

## Task 7: Unified Sidebar (Platform)

**Files:**
- Create: `core/platform-ui-core/src/components/unified-sidebar.tsx`

The merged sidebar that renders static platform items + dynamic sidecar items.

- [ ] **Step 1: Create the unified sidebar**

```tsx
// core/platform-ui-core/src/components/unified-sidebar.tsx
"use client";

import {
  ChevronRight,
  CreditCard,
  Inbox,
  CircleDot,
  Target,
  LayoutDashboard,
  LogOutIcon,
  Network,
  Boxes,
  Repeat,
  Settings,
  Shield,
  SquarePen,
  UserIcon,
  Wallet,
} from "lucide-react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { signOut, useSession } from "@/lib/auth-client";
import { productName } from "@/lib/brand-config";
import { getRouteType } from "@/lib/sidecar-routes";
import { useSidecarBridge } from "@/hooks/use-sidecar-bridge";
import { CreditBalanceBadge } from "@/components/billing/credit-balance-badge";
import { cn } from "@/lib/utils";

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function SidebarNavItem({
  href,
  label,
  icon: Icon,
  badge,
  badgeTone,
  liveCount,
  onClick,
  active,
}: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: number;
  badgeTone?: "default" | "danger";
  liveCount?: number;
  onClick: () => void;
  active: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-foreground",
        active
          ? "bg-terminal/5 border-l-2 border-terminal text-terminal"
          : "text-muted-foreground",
      )}
    >
      <span className="flex items-center gap-2.5">
        <Icon className="size-4 shrink-0 opacity-70" />
        {label}
      </span>
      <span className="flex items-center gap-1.5">
        {badge != null && badge > 0 && (
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none",
              badgeTone === "danger"
                ? "bg-red-500/15 text-red-500"
                : "bg-muted text-muted-foreground",
            )}
          >
            {badge}
          </span>
        )}
        {liveCount != null && liveCount > 0 && (
          <span className="flex items-center gap-1">
            <span className="relative flex h-2 w-2">
              <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
            </span>
            <span className="text-[10px] text-blue-400">{liveCount}</span>
          </span>
        )}
      </span>
    </button>
  );
}

function SidebarSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-widest font-mono text-muted-foreground/60">
        {label}
      </p>
      {children}
    </div>
  );
}

export function UnifiedSidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const { sidebarData, navigate: sidecarNavigate, command, currentSidecarPath } = useSidecarBridge();
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [agentsOpen, setAgentsOpen] = useState(true);

  const user = session?.user;

  // Determine what's active: sidecar path or native path
  const activePath = currentSidecarPath ?? pathname;

  function isActive(href: string): boolean {
    if (href === "/dashboard") return activePath === "/dashboard" || activePath === "/";
    return activePath.startsWith(href);
  }

  function handleNav(href: string) {
    onNavigate?.();
    const type = getRouteType(href);
    if (type === "iframe") {
      sidecarNavigate(href);
      // Update URL bar immediately for responsiveness
      window.history.pushState(null, "", href);
    } else {
      router.push(href);
    }
  }

  async function handleSignOut() {
    try {
      await signOut();
    } catch {
      // Continue to redirect
    }
    router.push("/login");
  }

  return (
    <div data-slot="sidebar" className="flex h-full flex-col">
      {/* Brand header */}
      <div className="flex h-14 items-center border-b border-sidebar-border px-6">
        <span
          className="text-lg font-semibold tracking-tight text-terminal"
          style={{ textShadow: "0 0 12px var(--terminal-glow, rgba(0, 255, 65, 0.4))" }}
        >
          {productName()}
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto space-y-4 px-3 py-4">
        {/* Top actions */}
        <div className="space-y-0.5">
          <button
            type="button"
            onClick={() => command("openNewIssue")}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors"
          >
            <SquarePen className="size-4 shrink-0 opacity-70" />
            New Issue
          </button>
          <SidebarNavItem
            href="/dashboard"
            label="Dashboard"
            icon={LayoutDashboard}
            liveCount={sidebarData?.liveRunCount}
            onClick={() => handleNav("/dashboard")}
            active={isActive("/dashboard")}
          />
          <SidebarNavItem
            href="/inbox"
            label="Inbox"
            icon={Inbox}
            badge={sidebarData?.inboxBadge}
            badgeTone={sidebarData?.failedRuns ? "danger" : "default"}
            onClick={() => handleNav("/inbox")}
            active={isActive("/inbox")}
          />
        </div>

        {/* Work */}
        <SidebarSection label="Work">
          <SidebarNavItem href="/issues" label="Issues" icon={CircleDot} onClick={() => handleNav("/issues")} active={isActive("/issues")} />
          <SidebarNavItem href="/routines" label="Routines" icon={Repeat} onClick={() => handleNav("/routines")} active={isActive("/routines")} />
          <SidebarNavItem href="/goals" label="Goals" icon={Target} onClick={() => handleNav("/goals")} active={isActive("/goals")} />
        </SidebarSection>

        {/* Projects — dynamic from sidecar */}
        <Collapsible open={projectsOpen} onOpenChange={setProjectsOpen}>
          <div className="group">
            <div className="flex items-center px-3 py-1.5">
              <CollapsibleTrigger className="flex items-center gap-1 flex-1 min-w-0">
                <ChevronRight className={cn("h-3 w-3 text-muted-foreground/60 transition-transform opacity-0 group-hover:opacity-100", projectsOpen && "rotate-90")} />
                <span className="text-[10px] font-medium uppercase tracking-widest font-mono text-muted-foreground/60">Projects</span>
              </CollapsibleTrigger>
              <button
                type="button"
                onClick={() => command("openNewProject")}
                className="flex items-center justify-center h-4 w-4 rounded text-muted-foreground/60 hover:text-foreground hover:bg-accent/50 transition-colors"
                aria-label="New project"
              >
                <span className="text-xs">+</span>
              </button>
            </div>
          </div>
          <CollapsibleContent>
            <div className="flex flex-col gap-0.5 mt-0.5">
              {sidebarData?.projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => {
                    onNavigate?.();
                    handleNav(`/projects/${project.id}/issues`);
                  }}
                  className={cn(
                    "flex items-center gap-2.5 w-full px-3 py-1.5 text-[13px] font-medium transition-colors rounded-md",
                    isActive(`/projects/${project.id}`)
                      ? "bg-accent text-foreground"
                      : "text-foreground/80 hover:bg-accent/50 hover:text-foreground",
                  )}
                >
                  <span className="shrink-0 h-3.5 w-3.5 rounded-sm" style={{ backgroundColor: project.color ?? "#6366f1" }} />
                  <span className="flex-1 truncate text-left">{project.name}</span>
                </button>
              ))}
              {(!sidebarData || sidebarData.projects.length === 0) && (
                <p className="px-3 py-1 text-xs text-muted-foreground/40">No projects yet</p>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Agents — dynamic from sidecar */}
        <Collapsible open={agentsOpen} onOpenChange={setAgentsOpen}>
          <div className="group">
            <div className="flex items-center px-3 py-1.5">
              <CollapsibleTrigger className="flex items-center gap-1 flex-1 min-w-0">
                <ChevronRight className={cn("h-3 w-3 text-muted-foreground/60 transition-transform opacity-0 group-hover:opacity-100", agentsOpen && "rotate-90")} />
                <span className="text-[10px] font-medium uppercase tracking-widest font-mono text-muted-foreground/60">Agents</span>
              </CollapsibleTrigger>
              <button
                type="button"
                onClick={() => command("openNewAgent")}
                className="flex items-center justify-center h-4 w-4 rounded text-muted-foreground/60 hover:text-foreground hover:bg-accent/50 transition-colors"
                aria-label="New agent"
              >
                <span className="text-xs">+</span>
              </button>
            </div>
          </div>
          <CollapsibleContent>
            <div className="flex flex-col gap-0.5 mt-0.5">
              {sidebarData?.agents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => {
                    onNavigate?.();
                    handleNav(`/agents/${agent.id}`);
                  }}
                  className={cn(
                    "flex items-center gap-2.5 w-full px-3 py-1.5 text-[13px] font-medium transition-colors rounded-md",
                    isActive(`/agents/${agent.id}`)
                      ? "bg-accent text-foreground"
                      : "text-foreground/80 hover:bg-accent/50 hover:text-foreground",
                  )}
                >
                  <span className="shrink-0 h-3.5 w-3.5 text-muted-foreground">
                    {/* Simple circle icon — agent icons can be enhanced later */}
                    <span className={cn("block h-3.5 w-3.5 rounded-full border-2", agent.liveRun ? "border-blue-500 bg-blue-500/20" : "border-muted-foreground/40")} />
                  </span>
                  <span className="flex-1 truncate text-left">{agent.name}</span>
                  {agent.liveRun && (
                    <span className="flex items-center gap-1 shrink-0">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                      </span>
                      {agent.liveRunCount > 0 && (
                        <span className="text-[11px] font-medium text-blue-400">{agent.liveRunCount}</span>
                      )}
                    </span>
                  )}
                  {agent.pauseReason === "budget" && (
                    <span className="text-[10px] text-amber-500" title="Paused by budget">$</span>
                  )}
                </button>
              ))}
              {(!sidebarData || sidebarData.agents.length === 0) && (
                <p className="px-3 py-1 text-xs text-muted-foreground/40">No agents yet</p>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Company */}
        <SidebarSection label="Company">
          <SidebarNavItem href="/org" label="Org" icon={Network} onClick={() => handleNav("/org")} active={isActive("/org")} />
          <SidebarNavItem href="/skills" label="Skills" icon={Boxes} onClick={() => handleNav("/skills")} active={isActive("/skills")} />
        </SidebarSection>

        {/* Account — native platform pages */}
        <SidebarSection label="Account">
          <SidebarNavItem href="/billing/credits" label="Credits" icon={Wallet} onClick={() => handleNav("/billing/credits")} active={isActive("/billing/credits")} />
          <SidebarNavItem href="/settings/profile" label="Settings" icon={Settings} onClick={() => handleNav("/settings/profile")} active={isActive("/settings")} />
          {(user as { role?: string } | undefined)?.role === "platform_admin" && (
            <SidebarNavItem href="/admin" label="Admin" icon={Shield} onClick={() => handleNav("/admin")} active={isActive("/admin")} />
          )}
        </SidebarSection>
      </nav>

      {/* User footer */}
      <div className="border-t border-sidebar-border px-3 py-3">
        {isPending ? (
          <div className="flex items-center gap-3 px-3 py-2">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-4 w-24" />
          </div>
        ) : user ? (
          <DropdownMenu>
            <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground outline-none">
              {user.image ? (
                <Image
                  src={user.image}
                  alt={user.name ?? "User avatar"}
                  width={32}
                  height={32}
                  className="size-8 rounded-full object-cover"
                />
              ) : (
                <span className="flex size-8 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold ring-1 ring-terminal/20">
                  {user.name?.trim() ? getInitials(user.name) : <UserIcon className="size-4" />}
                </span>
              )}
              <span className="truncate">{user.name ?? user.email}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col gap-1">
                  {user.name && <span className="text-sm font-medium">{user.name}</span>}
                  {user.email && <span className="text-xs text-muted-foreground">{user.email}</span>}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleNav("/settings/profile")}>
                <UserIcon />
                Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOutIcon />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd ~/platform
git add core/platform-ui-core/src/components/unified-sidebar.tsx
git commit -m "feat(platform): add UnifiedSidebar with dynamic sidecar data"
```

---

## Task 8: Unified Dashboard Layout (Shell)

**Files:**
- Create: `shells/paperclip-platform-ui/src/app/(dashboard)/unified-layout.tsx`
- Modify: `shells/paperclip-platform-ui/src/app/(dashboard)/layout.tsx`

This wires everything together: SidecarBridgeProvider + SidecarFrame + UnifiedSidebar + native page content area.

- [ ] **Step 1: Create the unified layout component**

```tsx
// shells/paperclip-platform-ui/src/app/(dashboard)/unified-layout.tsx
"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { SidecarBridgeProvider } from "@core/hooks/use-sidecar-bridge";
import { SidecarFrame } from "@core/components/sidecar-frame";
import { UnifiedSidebarContent } from "@core/components/unified-sidebar";
import { getRouteType } from "@core/lib/sidecar-routes";
import { Toaster } from "sonner";

export function UnifiedLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const routeType = getRouteType(pathname);

  // No instance URL lookup needed — /_sidecar/ is a same-origin proxy
  // The middleware handles routing to the right instance backend.

  return (
    <SidecarBridgeProvider instanceUrl="/_sidecar/">
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
          <div
            className="flex-1 overflow-auto"
            style={{ display: routeType === "native" ? "block" : "none" }}
          >
            {children}
          </div>
        </div>

        <Toaster position="top-right" richColors />
      </div>
    </SidecarBridgeProvider>
  );
}
```

- [ ] **Step 2: Update the shell's dashboard layout to use UnifiedLayout**

Replace `shells/paperclip-platform-ui/src/app/(dashboard)/layout.tsx`:

```tsx
// shells/paperclip-platform-ui/src/app/(dashboard)/layout.tsx
import { UnifiedLayout } from "./unified-layout";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <UnifiedLayout>{children}</UnifiedLayout>;
}
```

- [ ] **Step 3: Commit**

```bash
cd ~/platform
git add shells/paperclip-platform-ui/src/app/\(dashboard\)/unified-layout.tsx shells/paperclip-platform-ui/src/app/\(dashboard\)/layout.tsx
git commit -m "feat(shell): wire up UnifiedLayout with SidecarFrame and UnifiedSidebar"
```

---

## Task 9: Root Route + Onboarding Redirect

**Files:**
- Modify: `shells/paperclip-platform-ui/src/app/page.tsx`

When a user has no instance, they land on the CEO onboarding chat. When they have an instance, they go straight to `/dashboard`.

- [ ] **Step 1: Read current root page**

```bash
cat ~/platform/shells/paperclip-platform-ui/src/app/page.tsx
```

Check what it currently renders (likely a landing/marketing page or redirect).

- [ ] **Step 2: Update root page to detect instance**

The root page should check authentication first, then redirect:
- Authenticated with instance → `/dashboard`
- Authenticated without instance → `/instances/new` (the CEO onboarding chat — we keep this route for now, rename later)
- Not authenticated → landing page or `/login`

This is a server component so it can check auth + instances:

```tsx
// shells/paperclip-platform-ui/src/app/page.tsx
import { redirect } from "next/navigation";

export default function RootPage() {
  // For now, redirect to dashboard — the dashboard layout handles
  // the no-instance case by not showing the iframe.
  // The onboarding flow is at /instances/new until we migrate it.
  redirect("/dashboard");
}
```

Note: The full onboarding-as-default-route work (detecting no instance and showing the CEO chat inline) is a follow-up. For this task we ensure `/` redirects to the unified dashboard, and `instances/new` remains accessible for new users.

- [ ] **Step 3: Commit**

```bash
cd ~/platform
git add shells/paperclip-platform-ui/src/app/page.tsx
git commit -m "feat(shell): redirect root to unified dashboard"
```

---

## Task 10: Remove Dead Instance Pages

**Files:**
- Remove: `shells/paperclip-platform-ui/src/app/(dashboard)/instances/page.tsx`
- Remove: `shells/paperclip-platform-ui/src/app/(dashboard)/instances/[id]/page.tsx`
- Remove: `shells/paperclip-platform-ui/src/app/(dashboard)/instances/[id]/paperclip-instance-detail.tsx`
- Remove: `shells/paperclip-platform-ui/src/components/paperclip-dashboard.tsx`
- Remove: `shells/paperclip-platform-ui/src/components/paperclip-card.tsx`
- Remove: `shells/paperclip-platform-ui/src/components/add-paperclip-card.tsx`

- [ ] **Step 1: Remove the files**

```bash
cd ~/platform
rm shells/paperclip-platform-ui/src/app/\(dashboard\)/instances/page.tsx
rm shells/paperclip-platform-ui/src/app/\(dashboard\)/instances/\[id\]/page.tsx
rm shells/paperclip-platform-ui/src/app/\(dashboard\)/instances/\[id\]/paperclip-instance-detail.tsx
rm shells/paperclip-platform-ui/src/components/paperclip-dashboard.tsx
rm shells/paperclip-platform-ui/src/components/paperclip-card.tsx
rm shells/paperclip-platform-ui/src/components/add-paperclip-card.tsx
```

- [ ] **Step 2: Check for imports of removed files**

```bash
cd ~/platform
grep -r "paperclip-dashboard\|paperclip-card\|add-paperclip-card\|paperclip-instance-detail" shells/paperclip-platform-ui/src/ --include="*.tsx" --include="*.ts" -l
```

Fix any remaining imports. The `instances/new/page.tsx` (onboarding chat) stays — it's still the new-user entry point.

- [ ] **Step 3: Remove corresponding test files**

```bash
rm -f shells/paperclip-platform-ui/src/__tests__/paperclip-dashboard.test.tsx
rm -f shells/paperclip-platform-ui/src/__tests__/paperclip-card.test.tsx
rm -f shells/paperclip-platform-ui/src/__tests__/add-paperclip-card.test.tsx
```

- [ ] **Step 4: Verify shell builds**

```bash
cd ~/platform/shells/paperclip-platform-ui
pnpm build
```

Expected: Build succeeds. No broken imports.

- [ ] **Step 5: Commit**

```bash
cd ~/platform
git add -A shells/paperclip-platform-ui/src/
git commit -m "chore(shell): remove dead instance list/detail/card pages"
```

---

## Task 11: Dashboard Route for Iframe

**Files:**
- Create or modify: `shells/paperclip-platform-ui/src/app/(dashboard)/dashboard/page.tsx`

The `/dashboard` route needs to exist as a Next.js page so the router doesn't 404. But its content is rendered by the sidecar iframe, so the page itself is empty — the UnifiedLayout handles showing the iframe.

- [ ] **Step 1: Create a minimal dashboard page**

```tsx
// shells/paperclip-platform-ui/src/app/(dashboard)/dashboard/page.tsx

/** Dashboard content is rendered by the sidecar iframe.
 *  This page exists so Next.js routing resolves /dashboard without 404.
 */
export default function DashboardPage() {
  return null;
}
```

- [ ] **Step 2: Create stub pages for other iframe routes**

Each iframe route needs a Next.js page so the router resolves. Create minimal stubs:

```bash
mkdir -p ~/platform/shells/paperclip-platform-ui/src/app/\(dashboard\)/inbox
mkdir -p ~/platform/shells/paperclip-platform-ui/src/app/\(dashboard\)/issues
mkdir -p ~/platform/shells/paperclip-platform-ui/src/app/\(dashboard\)/routines
mkdir -p ~/platform/shells/paperclip-platform-ui/src/app/\(dashboard\)/goals
mkdir -p ~/platform/shells/paperclip-platform-ui/src/app/\(dashboard\)/projects
mkdir -p ~/platform/shells/paperclip-platform-ui/src/app/\(dashboard\)/agents
mkdir -p ~/platform/shells/paperclip-platform-ui/src/app/\(dashboard\)/org
mkdir -p ~/platform/shells/paperclip-platform-ui/src/app/\(dashboard\)/skills
```

Each gets a `page.tsx` that returns `null`:

```tsx
// Template for all iframe route stubs:
/** Content rendered by sidecar iframe. */
export default function Page() { return null; }
```

Also create catch-all stubs for nested routes:

```bash
mkdir -p ~/platform/shells/paperclip-platform-ui/src/app/\(dashboard\)/projects/\[...slug\]
mkdir -p ~/platform/shells/paperclip-platform-ui/src/app/\(dashboard\)/agents/\[...slug\]
mkdir -p ~/platform/shells/paperclip-platform-ui/src/app/\(dashboard\)/issues/\[...slug\]
```

Each catch-all gets the same `page.tsx` stub returning `null`.

- [ ] **Step 3: Commit**

```bash
cd ~/platform
git add shells/paperclip-platform-ui/src/app/\(dashboard\)/
git commit -m "feat(shell): add stub pages for iframe routes"
```

---

## Task 12: End-to-End Verification

- [ ] **Step 1: Start the sidecar dev server**

```bash
cd ~/platform/sidecars/paperclip
pnpm dev:ui
```

Verify the sidecar UI loads at its local URL. Append `?embedded=1` to the URL — confirm that the sidebar, breadcrumb bar, and bottom nav are hidden, showing only the content area.

- [ ] **Step 2: Start the platform shell dev server**

```bash
cd ~/platform/shells/paperclip-platform-ui
pnpm dev
```

Navigate to `http://localhost:3000/dashboard`. Verify:
- The unified sidebar renders with all sections (Work, Projects, Agents, Account)
- The iframe loads and the sidecar content appears
- Clicking sidebar items navigates the iframe
- Clicking "Billing" hides the iframe and shows the native billing page
- Clicking "Dashboard" again shows the iframe (state preserved)
- The browser URL bar updates when navigating inside the sidecar

- [ ] **Step 3: Verify postMessage flow**

Open browser devtools console. Filter for `postMessage`. Verify:
- Sidecar posts `{ type: "ready" }` on load
- Sidecar posts `{ type: "sidebarData", ... }` with projects and agents
- Clicking sidebar items triggers `{ type: "navigate", ... }` to iframe
- Navigating inside sidecar content posts `{ type: "routeChanged", ... }` back

- [ ] **Step 4: Build check**

```bash
cd ~/platform/shells/paperclip-platform-ui
pnpm build
```

```bash
cd ~/platform/sidecars/paperclip/ui
pnpm build
```

Both must succeed.

- [ ] **Step 5: Commit any fixes from verification**

```bash
cd ~/platform
git add -A
git commit -m "fix: address issues found during e2e verification"
```
