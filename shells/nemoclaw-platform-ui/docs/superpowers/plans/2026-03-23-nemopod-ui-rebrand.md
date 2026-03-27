# NemoPod UI Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all WOPR/generic terminal branding with a cohesive NemoPod identity — indigo primary, NVIDIA green heritage badge, modern SaaS aesthetic.

**Architecture:** CSS variable overrides in globals.css retheme all platform-ui-core components without modifying the core package. Custom landing page replaces the core LandingPage. Amber hardcoded classes in local components get replaced with indigo. Font switches from JetBrains Mono body to system-ui.

**Tech Stack:** Next.js 15, Tailwind v4, platform-ui-core (shadcn/ui), CSS custom properties

**Spec:** `docs/superpowers/specs/2026-03-23-nemopod-ui-rebrand.md`

---

### Task 1: CSS Theme Override — Indigo Palette

Override all platform-ui-core CSS variables to use the indigo palette. This single change rethemes the entire app (sidebar, buttons, inputs, toasts, etc.).

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add dark theme overrides after the import**

```css
@import "../../node_modules/@wopr-network/platform-ui-core/src/app/globals.css";

/* NemoPod indigo theme — overrides platform-ui-core terminal green */
.dark {
  --primary: #818cf8;
  --primary-foreground: #ffffff;
  --accent: #818cf820;
  --accent-foreground: #e0e7ff;
  --ring: #818cf8;

  --background: #09090b;
  --foreground: #e2e8f0;
  --card: #0f172a;
  --card-foreground: #e2e8f0;
  --popover: #0f172a;
  --popover-foreground: #e2e8f0;
  --muted: #1e293b;
  --muted-foreground: #94a3b8;
  --border: #1e293b;
  --input: #1e293b;

  --secondary: #1e293b;
  --secondary-foreground: #e2e8f0;
  --destructive: #ef4444;
  --destructive-foreground: #ffffff;

  --sidebar: #0a0f1a;
  --sidebar-foreground: #e0e7ff;
  --sidebar-border: #1e293b;
  --sidebar-accent: #818cf820;
  --sidebar-accent-foreground: #818cf8;
  --sidebar-primary: #818cf8;
  --sidebar-primary-foreground: #ffffff;

  --terminal: #818cf8;
  --terminal-dim: #6366f1;
}

/* Remove CRT/scanline effects */
.crt-scanlines::before,
.crt-scanlines::after {
  display: none !important;
}
```

- [ ] **Step 2: Keep the existing sweep keyframe**

The `@keyframes sweep` block stays as-is after the theme override.

- [ ] **Step 3: Verify by running dev server**

Run: `pnpm dev`
Expected: App loads with indigo accents instead of terminal green. Sidebar, buttons, focus rings all indigo.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "feat: indigo CSS theme override for NemoPod rebrand"
```

---

### Task 2: Font + Layout — System UI Body Font

Switch from JetBrains Mono everywhere to system-ui for body, keeping mono for code/chat only.

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add font-sans override in globals.css**

Add after the `.dark` block:

```css
/* System font for body, mono only for chat/code */
body {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
```

- [ ] **Step 2: Update layout.tsx — expand brand config**

Replace the `setBrandConfig` call:

```typescript
setBrandConfig({
  homePath: "/instances",
  productName: "NemoPod",
  brandName: "NemoPod",
  domain: "nemopod.com",
  appDomain: "app.nemopod.com",
  tagline: "NVIDIA NeMo, one click away",
  price: "$5 free credits",
  storagePrefix: "nemopod",
  eventPrefix: "nemopod",
  envVarPrefix: "NEMOPOD",
  toolPrefix: "nemopod",
  tenantCookieName: "nemopod_tenant",
  companyLegalName: "NemoPod",
  navItems: [
    { label: "NemoClaws", href: "/instances" },
    { label: "Billing", href: "/billing/plans" },
    { label: "Settings", href: "/settings/profile" },
  ],
});
```

Note: Keep the JetBrains Mono import and `variable` on body — it's still used for `font-mono` in chat. Just the body default font changes via CSS.

- [ ] **Step 3: Verify**

Run: `pnpm dev`
Expected: Sidebar and headings use system font. Chat messages still use monospace.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx
git commit -m "feat: system-ui body font + full brand config for NemoPod"
```

---

### Task 3: Landing Page

Replace the core LandingPage with a custom NemoPod landing page.

**Files:**
- Modify: `src/app/page.tsx` (replace entire content)

- [ ] **Step 1: Replace page.tsx with custom landing page**

Build a single-file landing page component with:
- **Nav**: Indigo dot logo + "NemoPod" + green "NVIDIA NeMo" badge, "Docs" link, "Pricing" link, "Get Started" button (links to /signup)
- **Hero**: Eyebrow "AI AGENT PLATFORM", h1 "NVIDIA NeMo, one click away" (with "one click away" in indigo), subtext, two CTAs ("Start Free" → /signup, "View Docs" → #features)
- **Features section** (id="features"): 3 cards — Instant Deploy (Zap icon), Chat Interface (MessageSquare icon), Pay Per Use (CreditCard icon). Use lucide-react icons.
- **Footer**: "Built on enterprise-grade infrastructure" + NVIDIA powered-by badge with green diamond

All styling via Tailwind classes using the CSS variables from Task 1. Dark background (#09090b), indigo buttons, slate cards.

No auth, no API calls, no client-side JS needed — this can be a server component.

- [ ] **Step 2: Verify**

Open: `http://localhost:3000` (or whatever the dev URL is)
Expected: Professional SaaS landing page with indigo CTA buttons, 3 feature cards, NVIDIA badge at bottom.

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: custom NemoPod landing page with NVIDIA heritage"
```

---

### Task 4: Login/Signup Styling

The auth pages inherit from platform-ui-core. The CSS variable overrides from Task 1 handle most of it. Wrap the core auth layout with a NemoPod logo header.

**Files:**
- Modify: `src/app/(auth)/layout.tsx` (currently re-exports core layout)

- [ ] **Step 1: Replace the re-export with a wrapper**

The file currently contains `export { default } from "@core/app/(auth)/layout";`. Replace it with a wrapper that adds the NemoPod logo while still rendering the core auth layout's content:

```tsx
import CoreAuthLayout from "@core/app/(auth)/layout";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <CoreAuthLayout>
      <div className="mb-6 flex items-center justify-center gap-2.5">
        <div className="h-2.5 w-2.5 rounded-full bg-[#818cf8] shadow-[0_0_12px_#818cf860]" />
        <span className="text-lg font-semibold text-[#e0e7ff]">NemoPod</span>
      </div>
      {children}
    </CoreAuthLayout>
  );
}
```

If `CoreAuthLayout` doesn't work as a wrapping component (it may be a default export that expects to be the root), fall back to a standalone layout that matches the core's centered card pattern:

```tsx
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#09090b] px-4">
      <div className="mb-8 flex items-center gap-2.5">
        <div className="h-2.5 w-2.5 rounded-full bg-[#818cf8] shadow-[0_0_12px_#818cf860]" />
        <span className="text-lg font-semibold text-[#e0e7ff]">NemoPod</span>
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Open: `/login`
Expected: NemoPod logo above login card, indigo sign-in button, dark background.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(auth\)/layout.tsx
git commit -m "feat: NemoPod auth layout with logo"
```

---

### Task 5: Restyle First Run — Amber → Indigo

Replace all amber classes in first-run.tsx with indigo.

**Files:**
- Modify: `src/components/first-run.tsx`

- [ ] **Step 1: Replace amber classes**

Find and replace in `src/components/first-run.tsx`:
- `text-amber-400` → `text-indigo-400`
- `focus:border-amber-400/60` → `focus:border-indigo-400/60`
- `text-amber-400/40` → `text-indigo-400/40`
- Any other amber references → indigo equivalent

Also replace `font-mono` on the heading with `font-sans` if present.

- [ ] **Step 2: Verify**

Navigate to `/instances` with no instances.
Expected: First-run screen with indigo focus border on input, indigo subdomain preview text.

- [ ] **Step 3: Commit**

```bash
git add src/components/first-run.tsx
git commit -m "feat: restyle first-run with indigo accent"
```

---

### Task 6: Restyle Chat Tabs — Amber → Indigo

Replace amber in chat-tabs.tsx with indigo.

**Files:**
- Modify: `src/components/chat-tabs.tsx`

- [ ] **Step 1: Replace amber classes**

Find and replace in `src/components/chat-tabs.tsx`:
- `border-amber-400` → `border-indigo-400`
- `hover:text-amber-400` → `hover:text-indigo-400`
- `hover:bg-amber-400/10` → `hover:bg-indigo-400/10`
- Any other amber references → indigo

- [ ] **Step 2: Verify**

Navigate to `/instances` with existing instances.
Expected: Active tab has indigo underline. [+] button has indigo hover.

- [ ] **Step 3: Commit**

```bash
git add src/components/chat-tabs.tsx
git commit -m "feat: restyle chat tabs with indigo accent"
```

---

### Task 7: Restyle NemoClawApp — Amber → Indigo

Replace amber in the main app orchestrator.

**Files:**
- Modify: `src/components/nemoclaw-app.tsx`

- [ ] **Step 1: Replace amber classes**

Find and replace in `src/components/nemoclaw-app.tsx`:
- `text-amber-400/60` → `text-indigo-400/60` (loader spinner)
- Any other amber or terminal-green references → indigo

- [ ] **Step 2: Verify**

Navigate to `/instances`.
Expected: Loading spinner is indigo. All accent colors are indigo.

- [ ] **Step 3: Commit**

```bash
git add src/components/nemoclaw-app.tsx
git commit -m "feat: restyle nemoclaw-app with indigo accent"
```

---

### Task 8: Restyle Instance Detail Page

The `/instances/[id]` route has a detail component that may have old brand colors.

**Files:**
- Modify: `src/app/(dashboard)/instances/[id]/nemoclaw-instance-detail.tsx`

- [ ] **Step 1: Check for amber/terminal/green references**

Run: `grep -n "amber\|terminal\|#00ff41\|#00cc33" src/app/\(dashboard\)/instances/\[id\]/nemoclaw-instance-detail.tsx`

Replace any amber classes with indigo equivalents. If no color references found, this task is a no-op.

- [ ] **Step 2: Verify**

Navigate to `/instances/<any-id>`.
Expected: Detail page uses indigo accents, no amber or terminal green.

- [ ] **Step 3: Commit (if changes made)**

```bash
git add src/app/\(dashboard\)/instances/
git commit -m "feat: restyle instance detail with indigo accent"
```

---

### Task 9: Update Tests

Tests may reference amber classes or terminal-green. Update to match new styling.

**Files:**
- Modify: `src/__tests__/first-run.test.tsx` (if amber/color assertions exist)
- Modify: `src/__tests__/chat-tabs.test.tsx` (if amber/color assertions exist)
- Modify: `src/__tests__/nemoclaw-app.test.tsx` (if amber/color assertions exist)

- [ ] **Step 1: Run all tests to find failures**

Run: `npx vitest run src/__tests__/ --reporter=verbose`
Expected: Note any failures related to color classes or brand text.

- [ ] **Step 2: Fix any failing assertions**

Update test expectations to match new indigo classes and "NemoPod" brand text.

- [ ] **Step 3: Run tests again**

Run: `npx vitest run src/__tests__/ --reporter=verbose`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/__tests__/
git commit -m "fix: update tests for NemoPod rebrand"
```

---

### Task 10: Final Cleanup — Remove WOPR References

Search for any remaining WOPR, terminal-green, or old brand references.

**Files:**
- Potentially: any file in `src/`

- [ ] **Step 1: Search for WOPR references**

Run: `grep -ri "wopr\|terminal.green\|#00ff41\|#00cc33" src/ --include="*.tsx" --include="*.ts" --include="*.css" -l`
Expected: No matches in local files (core package refs are fine).

- [ ] **Step 2: Fix any remaining references**

Replace any found references with NemoPod equivalents.

- [ ] **Step 3: Run full check**

Run: `pnpm build`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit and push**

```bash
git add -A
git commit -m "chore: remove remaining WOPR references"
git push origin main
```
