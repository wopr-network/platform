# Unified Shell: Merge Platform UI + Sidecar into One App

**Date:** 2026-04-02
**Status:** Design approved

## Problem

Paperclip users experience two separate apps: a platform dashboard (billing, instances, settings) and a sidecar UI (agents, issues, projects, goals). Users sign up, create an "instance," get redirected to a subdomain, and land in a completely different app with its own sidebar, routing, and chrome. This creates cognitive overhead, a fragmented experience, and exposes infrastructure concepts ("instances") that users don't care about.

## Goal

One app. One sidebar. One experience. The user never knows there's an iframe, never sees a second chrome, never gets redirected to a subdomain. They sign up, describe what they want to build, and land in their workspace.

## Architecture

### Embed Model

The platform serves everything on one domain (`runpaperclip.com`). No subdomains. The sidecar UI is loaded in a same-origin iframe via an internal proxy route (`/_sidecar/`). The platform middleware proxies `/_sidecar/*` requests to the instance's internal backend URL (container IP/hostname, known from the instance record).

Same-origin iframe means:
- No cross-origin issues, no wildcard TLS, no wildcard DNS
- No subdomain provisioning
- postMessage works without origin validation complexity (same origin)
- Parent can directly access `iframe.contentWindow` if needed
- CSP `frame-ancestors` is not an issue (same origin)

Auth flows through the existing proxy — the middleware attaches auth headers when proxying to the instance backend, same as `hosted_proxy` does today but without the subdomain layer.

### Page Type Switching

Sidebar items are tagged as `iframe` or `native`:

- **iframe routes** (Dashboard, Inbox, Issues, Routines, Goals, Projects, Agents, Org, Skills): Platform shows the iframe and sends a `navigate` postMessage.
- **native routes** (Billing, Settings, Admin): Platform hides the iframe via `display: none` (preserving sidecar state) and renders the platform page natively.

Switching back to an iframe route re-shows the iframe — it's still alive with all state intact.

### URL Bar Sync

When the sidecar posts `routeChanged` with a path like `/agents/abc-123`, the platform calls `history.replaceState` to update the browser URL to `runpaperclip.com/agents/abc-123`. Since the iframe is same-origin, this is straightforward:

- **Bookmarks work** — URL reflects the actual sidecar route on the platform domain.
- **Refresh works** — Platform sees `/agents/abc-123`, recognizes it as a sidecar route, loads the iframe with `/_sidecar/agents/abc-123`.
- **Back/forward work** — Platform listens to `popstate` and sends `navigate` commands to the iframe.

## postMessage Protocol

### Platform → Sidecar

```ts
// Navigate to a route
{ type: "navigate", path: "/agents/abc-123" }

// Trigger a dialog
{ type: "command", action: "openNewIssue" | "openCommandPalette" | "openNewAgent" }

// Forward a toast to sidecar
{ type: "toast", level: "success" | "error" | "info", message: string }
```

### Sidecar → Platform

```ts
// Route changed (fires on every react-router navigation)
{ type: "routeChanged", path: "/agents/abc-123", title: "Agent: CEO" }

// Sidebar data (fires on mount + whenever data changes)
{ type: "sidebarData", payload: {
  companyName: string,
  brandColor: string | null,
  projects: Array<{ id: string, name: string, issuePrefix: string }>,
  agents: Array<{ id: string, name: string, status: string, liveRun: boolean }>,
  inboxBadge: number,
  liveRunCount: number,
}}

// Toast event (platform renders it above the iframe)
{ type: "toast", level: "success" | "error" | "info", message: string }

// Ready signal (iframe finished loading)
{ type: "ready" }
```

### Security

Both sides validate `event.origin`:
- Platform only accepts messages from the instance subdomain.
- Sidecar only accepts messages from the platform domain.

### Initialization Sequence

1. Platform mounts same-origin iframe with `src="/_sidecar/"` (proxied to instance backend)
2. Sidecar boots as headless content renderer, mounts `EmbeddedBridge`
3. `EmbeddedBridge` posts `{ type: "ready" }` to parent
4. Platform receives `ready`, sends initial `navigate` if URL has a deep path
5. Sidecar posts `sidebarData` with initial state
6. Platform sidebar renders with real data

## Unified Sidebar

### Navigation Structure

```
Paperclip                         ← brand name
──────────────────────────────────
  New Issue                       → postMessage: openNewIssue
  Dashboard                       → iframe /dashboard
  Inbox                    [3]    → iframe /inbox
──────────────────────────────────
Work
  Issues                          → iframe /issues
  Routines              [Beta]    → iframe /routines
  Goals                           → iframe /goals
──────────────────────────────────
Projects                          → iframe (dynamic list from sidebarData)
  Project Alpha                   → iframe /projects/abc
  Project Beta                    → iframe /projects/def
──────────────────────────────────
Agents                     [2]    → iframe (dynamic list from sidebarData)
  CEO Agent            [live]     → iframe /agents/abc
  Dev Agent            [idle]     → iframe /agents/def
──────────────────────────────────
Company
  Org                             → iframe /org
  Skills                          → iframe /skills
──────────────────────────────────
Account
  Billing                         → native /billing/credits
  Settings                        → native /settings/profile
  Admin                           → native /admin (admin only)
──────────────────────────────────
[user avatar]            Sign out
```

### Data Sources

- **Static items** (Billing, Settings, Admin, section headers): From brand config.
- **Dynamic items** (Projects list, Agents list, inbox badge, live run count): From sidecar via `sidebarData` postMessage.
- **Active state**: Derived from the last `routeChanged` path (iframe routes) or the current Next.js pathname (native routes). Prefix matching: `/agents/abc-123` highlights "Agents" and the specific agent.

### Suppressed Sidecar Routes

These sidecar routes are NOT exposed in the unified nav:
- **Costs** — replaced by platform Billing
- **Activity** — available within sidecar Dashboard
- **Company Settings** — replaced by platform Settings
- **Sidecar Dashboard** — IS the unified Dashboard (replaces platform's empty dashboard)

## Sidecar Changes

### Headless Content Renderer (no standalone mode)

The sidecar is ONLY accessed through the platform iframe. There is no standalone mode. `hostedMode` is always true — it's not a flag to check, it's the only way the sidecar runs.

This means we **remove** (not conditionally hide) all chrome from the sidecar:

**Removed permanently from Layout.tsx:**
- `Sidebar` component
- `InstanceSidebar` component
- `CompanyRail` component
- `BreadcrumbBar` component
- `MobileBottomNav` component
- `CommandPalette` component (commands forwarded from platform via postMessage)
- `ToastViewport` component (toasts forwarded to platform via postMessage)
- `OnboardingWizard` (platform handles onboarding)
- Sidebar footer (docs link, theme toggle, settings)

**Removed from App.tsx (dead standalone paths):**
- `AuthPage` route — platform handles auth
- `BoardClaimPage` route — no standalone access
- `CliAuthPage` route — CLI auth goes through platform
- `CloudAccessGate` — platform handles auth gating

**All `if (!hostedMode)` / `if (isHosted)` conditionals** throughout the codebase become dead code and can be removed over time. The "not hosted" branch is never reached.

**Keeps:**
- `<Outlet />` content area (full bleed)
- `PropertiesPanel` (renders inline within content)
- Route structure (react-router pages render as content)

**Adds:**
- `EmbeddedBridge` component — always mounted, not conditional. The postMessage bridge that syncs navigation, sidebar data, toasts, and commands with the parent platform shell.

### EmbeddedBridge Component

Mounted unconditionally at the app root:

```tsx
function EmbeddedBridge() {
  const location = useLocation();
  const navigate = useNavigate();
  const { selectedCompany } = useCompany();
  // ... hooks for agents, projects, inbox badge, live runs

  // Post route changes to parent
  useEffect(() => {
    window.parent.postMessage(
      { type: "routeChanged", path: location.pathname + location.search },
      platformOrigin
    );
  }, [location]);

  // Post sidebar data to parent on change
  useEffect(() => {
    window.parent.postMessage(
      { type: "sidebarData", payload: { companyName, projects, agents, inboxBadge, liveRunCount } },
      platformOrigin
    );
  }, [companyName, projects, agents, inboxBadge, liveRunCount]);

  // Listen for commands from parent
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== platformOrigin) return;
      if (event.data.type === "navigate") navigate(event.data.path);
      if (event.data.type === "command") handleCommand(event.data.action);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return null; // No visual output
}
```

## Platform Shell Changes

### SidecarFrame Component

New component that manages the iframe lifecycle:

- Renders a full-bleed `<iframe>` pointed at the instance subdomain (already `hostedMode`)
- Shows a loading skeleton while iframe loads (until `ready` postMessage received)
- Manages `display: none` toggling when switching between iframe and native routes
- Dispatches `navigate` postMessages when sidebar items are clicked
- Receives `routeChanged` and `sidebarData` and stores in React state
- Calls `history.replaceState` on route changes for URL sync
- Listens for `popstate` to handle browser back/forward

### Unified Sidebar Component

Replaces the current `SidebarContent`:

- Renders the merged navigation structure (static + dynamic items)
- Receives `sidebarData` from SidecarFrame as props or context
- On iframe item click: calls SidecarFrame's navigate method
- On native item click: uses Next.js router, SidecarFrame hides
- Active state: tracks whether we're in iframe mode or native mode, highlights accordingly
- Renders expandable project/agent lists with live status indicators from sidecar data

### Route Structure

The old routes:
- `/instances` → list page (REMOVED)
- `/instances/[id]` → detail page (REMOVED)
- `/instances/new` → onboarding chat (MOVED to `/`)
- `/dashboard` → empty platform dashboard (REPLACED by iframe sidecar dashboard)

The new routes:
- `/` → If no instance: onboarding chat. If instance exists: redirect to `/dashboard`
- `/dashboard`, `/inbox`, `/issues`, `/routines`, `/goals`, `/projects/*`, `/agents/*`, `/org`, `/skills` → iframe routes (SidecarFrame visible)
- `/billing/*`, `/settings/*`, `/admin/*` → native routes (SidecarFrame hidden)

## Onboarding & First-Run

### New User Flow

1. **Sign up / login** → platform detects no instance → renders CEO onboarding chat (existing `NewPaperclipInstancePage`, now at `/`)
2. **Chat produces a plan** → user names company → clicks "Found Company"
3. **`createInstance()` fires** → instead of `window.location.href` redirect:
   - Platform shows provisioning screen ("Setting up your workspace...")
   - Polls instance status until ready
   - Mounts `SidecarFrame` iframe pointed at the new instance
   - Sidecar boots in hostedMode, detects iframe, enters full headless mode, seeds company + first agent from onboarding plan
4. **User lands in unified dashboard** → sidebar populated with real data from sidecar

### Returning User Flow

1. **Login** → platform detects existing instance → mounts `SidecarFrame` immediately → user is in their dashboard

### Instance Switcher (Future)

For v1: one user = one instance. The instance is invisible infrastructure.

For v2: an instance switcher at the top of the sidebar (like the existing `AccountSwitcher`). The iframe repoints to the new instance subdomain. The sidebar re-populates from the new sidecar's `sidebarData`.

## What Doesn't Change

- **Sidecar server** — no backend changes. The sidecar API, provisioning, and content rendering all remain the same.
- **Instance infrastructure** — instances still run as containers with internal URLs. The platform proxies to them via `/_sidecar/`.
- **Auth** — the platform proxy attaches auth headers when forwarding to the instance backend, same mechanism as `hosted_proxy` but on a path instead of subdomain.
- **Platform billing/settings/admin** — these pages are untouched, just shown/hidden alongside the iframe.
- **Mobile** — the sidecar content is already responsive. The platform sidebar becomes a mobile drawer as it is today.

## What Gets Simpler

- **No standalone sidecar UI** — the sidecar is a headless content renderer. All chrome, auth, and navigation are the platform's responsibility.
- **No subdomains at all** — no wildcard DNS, no wildcard TLS, no subdomain provisioning. One domain serves everything. Instance names are just display names.
- **Same-origin iframe** — eliminates cross-origin complexity. postMessage, CSP, and cookie sharing all become trivial.
- **All `hostedMode` conditionals become dead code** — can be removed incrementally. The "not hosted" branches are never reached.

## Files to Create

| File | Description |
|------|-------------|
| `core/platform-ui-core/src/components/sidecar-frame.tsx` | iframe host, postMessage bridge, visibility toggle |
| `core/platform-ui-core/src/components/unified-sidebar.tsx` | Merged sidebar with static + dynamic items |
| `core/platform-ui-core/src/hooks/use-sidecar-bridge.ts` | React context/hook for sidecar communication state |
| `core/platform-ui-core/src/lib/sidecar-routes.ts` | Route type mapping (iframe vs native) |
| `sidecars/paperclip/ui/src/components/EmbeddedBridge.tsx` | postMessage bridge inside sidecar (always mounted) |

## Files to Modify

| File | Change |
|------|--------|
| `sidecars/paperclip/ui/src/App.tsx` | Remove standalone auth routes (AuthPage, BoardClaimPage, CliAuthPage, CloudAccessGate). Mount EmbeddedBridge unconditionally. |
| `sidecars/paperclip/ui/src/components/Layout.tsx` | Remove all chrome: Sidebar, InstanceSidebar, CompanyRail, BreadcrumbBar, MobileBottomNav, CommandPalette, ToastViewport, sidebar footer. Render only Outlet + PropertiesPanel. |
| `shells/paperclip-platform-ui/src/app/(dashboard)/layout.tsx` | Mount SidecarFrame, swap sidebar |
| `shells/paperclip-platform-ui/src/app/page.tsx` | Root route: onboarding or dashboard |
| `shells/paperclip-platform-ui/src/app/(dashboard)/instances/new/page.tsx` | Remove subdomain preview, remove `window.location.href` redirect, instance name is just a display name |
| `core/platform-ui-core/src/proxy.ts` | Add `/_sidecar/*` proxy rule: forward to instance internal URL with auth headers. Remove `frame-ancestors 'none'` for `/_sidecar/` paths (or allow self). |

## Files to Remove

| File | Reason |
|------|--------|
| `shells/paperclip-platform-ui/src/app/(dashboard)/instances/page.tsx` | No more instance list |
| `shells/paperclip-platform-ui/src/app/(dashboard)/instances/[id]/page.tsx` | No more instance detail |
| `shells/paperclip-platform-ui/src/app/(dashboard)/instances/[id]/paperclip-instance-detail.tsx` | No more instance detail |
| `shells/paperclip-platform-ui/src/components/paperclip-dashboard.tsx` | Replaced by sidecar dashboard |
| `shells/paperclip-platform-ui/src/components/paperclip-card.tsx` | No more instance cards |
| `shells/paperclip-platform-ui/src/components/add-paperclip-card.tsx` | Replaced by onboarding flow |
