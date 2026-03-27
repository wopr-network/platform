# NemoPod Full UI Rebrand

## Goal

Replace all WOPR/generic branding with a cohesive NemoPod identity. Indigo primary color, NVIDIA green as heritage badge. Modern SaaS aesthetic — not terminal.

## Design Direction

- **Primary color**: Indigo (#818CF8) — buttons, active states, links, accents
- **Background**: Near-black (#09090B, #0A0F1A)
- **Surface**: Dark slate (#0F172A) — cards, inputs, sidebar
- **Border**: Subtle (#1E293B)
- **Text**: Bright slate (#F1F5F9 headings, #E2E8F0 body, #94A3B8 secondary, #64748B muted)
- **NVIDIA badge**: Green (#76B900) used only for "Powered by NVIDIA NeMo" badges and credit balance
- **Font**: System UI stack for headings and body. Keep JetBrains Mono for chat messages and code only. Override `--font-sans` to system-ui in globals.css; keep `--font-mono` as JetBrains Mono. Remove JetBrains Mono from `<body>` className in layout.tsx.
- **Logo**: Indigo dot (8-10px, glowing) + "NemoPod" in system-ui semibold
- **Replace amber**: Current components use `amber-400` for active states (tabs, focus borders, loaders). Replace all amber with indigo.
- **Remove CRT effects**: Remove scanline overlays, `animate-terminal-pulse`, grid-dot backgrounds. These define the terminal aesthetic we're moving away from.

## Pages

### 1. Landing Page (nemopod.com)

The public-facing page before login. Standard SaaS single-scroll layout.

**Sections:**
- **Nav bar**: Logo (indigo dot + "NemoPod" + green "NVIDIA NeMo" badge), "Docs", "Pricing", "Get Started" button (indigo)
- **Hero**: Eyebrow "AI AGENT PLATFORM", headline "NVIDIA NeMo, one click away", subtext about instant pods + metered billing, two CTAs ("Start Free" primary, "View Docs" ghost)
- **Features**: 3 cards — "Instant Deploy" (hot pool, no cold starts), "Chat Interface" (tab-based, persistent history), "Pay Per Use" ($5 free credits, metered)
- **Social proof footer**: "Built on enterprise-grade infrastructure" + NVIDIA powered-by badge

**Implementation**: Replace existing `src/app/page.tsx` which currently imports `LandingPage` from `@core/components/landing/landing-page`. Build a fully custom landing component — do NOT restyle the core LandingPage (it's built around the terminal aesthetic). Pure static — no auth, no API calls.

### 2. Login Page (app.nemopod.com/login)

Clean centered card on dark background.

- Logo (indigo dot + "NemoPod") centered above
- "Welcome back" heading, "Sign in to your NemoPod account" subtext
- Email + Password fields with slate backgrounds, indigo focus borders
- "Sign in" button (indigo, full width)
- "Don't have an account? Sign up" link
- Forgot password link

**Implementation**: The auth pages inherit from `@core/app/(auth)/layout`. Override styles via CSS variables. The form components read shadcn theme vars, so overriding `--primary` to indigo handles buttons/focus. Custom `(auth)/layout.tsx` can add the NemoPod logo header.

### 3. Signup Page (app.nemopod.com/signup)

Same card layout as login with:
- Name, Email, Password, Confirm Password fields
- Terms checkbox
- "Create account" button (indigo)
- "Already have an account? Sign in" link

### 4. Sidebar (all dashboard pages)

- **Header**: Indigo dot + "NemoPod" text (no tagline, no terminal glow)
- **Nav items**: "NemoClaws" (active=indigo bg), "Billing", "Settings"
- **Credit balance**: Bottom of sidebar, slate card, green amount text
- **User menu**: Bottom, avatar + name, sign out

**Implementation**: Sidebar from platform-ui-core reads `getBrandConfig()` for navItems and product name. Override sidebar CSS vars (`--sidebar`, `--sidebar-foreground`, `--sidebar-border`, `--sidebar-accent`) in globals.css. The sidebar uses `text-terminal` class for the product name glow — override `--terminal` var to indigo to change it, or add a CSS override to remove the text-shadow.

### 5. First Run (no instances)

Centered in main content area:
- "Name your first NemoClaw" heading (24px, semibold)
- "This becomes your subdomain" subtext
- Text input (large, centered, slate bg, indigo focus)
- Subdomain preview below: "atlas.nemopod.com" in muted indigo
- "Press enter to create" hint

**Implementation**: Existing `src/components/first-run.tsx` — replace `amber-400` classes with indigo equivalents. Replace `font-mono` with system font for heading.

### 6. Dashboard / Chat (active instances)

- **Tab bar**: Below sidebar header. Each tab = dot (green=running, amber=warning, gray=stopped) + instance name. Active tab has indigo underline (replace amber). [+] button to add.
- **Chat area**: Full height flex. Messages with user bubbles (indigo tint, right-aligned) and bot bubbles (slate bg, left-aligned). Labels above each ("You", instance name).
- **Input bar**: Slate input with indigo focus + "Send" button (indigo).

**Implementation**: Existing `src/components/chat-tabs.tsx` — replace `amber-400/amber-500` border/text with `indigo-400`. Existing `src/components/nemoclaw-app.tsx` — replace amber loader color. ChatPanel from platform-ui-core renders messages — it reads CSS vars for styling.

### 7. Instance Detail Page

`/instances/[id]` route with `nemoclaw-instance-detail.tsx`. Restyle with indigo accents. This page shows individual instance info — apply same color treatment as dashboard.

### 8. Billing Page

Inherits from platform-ui-core. Indigo accent colors come automatically from CSS variable overrides.

### 9. Settings Page

Inherits from platform-ui-core. Same indigo accent treatment via CSS variables.

## Brand Config Changes

```typescript
// src/app/layout.tsx
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

## CSS Theme

Override shadcn/ui CSS variables directly in `src/app/globals.css`. Do NOT introduce a `--brand-*` layer — map directly to the variables platform-ui-core already uses:

```css
.dark {
  /* Core palette → indigo (hex format, matching platform-ui-core convention) */
  --primary: #818cf8;
  --primary-foreground: #ffffff;
  --accent: #818cf820;
  --accent-foreground: #e0e7ff;
  --ring: #818cf8;

  /* Backgrounds */
  --background: #09090b;
  --foreground: #e2e8f0;
  --card: #0f172a;
  --card-foreground: #e2e8f0;
  --popover: #0f172a;
  --popover-foreground: #e2e8f0;

  /* Borders */
  --border: #1e293b;
  --input: #1e293b;

  /* Sidebar */
  --sidebar: #0a0f1a;
  --sidebar-foreground: #e0e7ff;
  --sidebar-border: #1e293b;
  --sidebar-accent: #818cf820;
  --sidebar-accent-foreground: #818cf8;
  --sidebar-primary: #818cf8;
  --sidebar-primary-foreground: #ffffff;

  /* Terminal vars → indigo (used by core for glow effects) */
  --terminal: #818cf8;
  --terminal-dim: #6366f1;
}
```

Also remove or override CRT-specific styles:
- Remove `.crt-scanlines` pseudo-element or set opacity to 0
- Remove `animate-terminal-pulse` references
- Remove grid-dot background patterns

## Font Override

In `src/app/layout.tsx`:
- Keep JetBrains Mono import but only apply to `--font-mono`
- Set body className to use system font, not JetBrains Mono
- In globals.css: `--font-sans: system-ui, -apple-system, sans-serif;`

## What NOT to change

- platform-ui-core source code — style via CSS variables and brand config only
- tRPC client setup
- Auth flow logic (BetterAuth)
- Chat persistence / SSE hooks
- Pool claim / instance management logic

## Success Criteria

- Landing page at nemopod.com looks like a real SaaS product, not a WOPR reskin
- No terminal green anywhere except NVIDIA badge and credit balance
- No amber accents — all replaced with indigo
- No CRT/scanline/terminal-pulse effects
- System font for UI, monospace only for chat/code
- Login/signup feel modern and clean
- Dashboard sidebar, tabs, and chat all use indigo palette
- Consistent visual language across all pages
- No WOPR references anywhere in the UI
