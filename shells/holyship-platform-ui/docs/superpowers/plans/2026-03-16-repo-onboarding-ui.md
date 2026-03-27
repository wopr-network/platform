# Repo Onboarding UI Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add repo-scoped dashboard with analysis, story generation, and pipeline configuration to holyship-platform-ui.

**Architecture:** Dashboard becomes a repo card grid. Clicking a repo navigates to a detail page with tabs (Issues, Analyze, Stories, Pipeline). A typed API client talks to the holyship backend via Next.js rewrites. All components are client-side ("use client") with useEffect/useState for data fetching, following existing patterns.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS v4, shadcn/ui, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-16-repo-onboarding-ui-design.md`

---

## File Map

| File | Purpose |
|------|---------|
| `src/lib/holyship-client.ts` | Typed API client for interrogation, audit, gap, and flow endpoints |
| `src/lib/types.ts` | Shared TypeScript interfaces (RepoConfig, Gap, AuditCategory, etc.) |
| `src/app/dashboard/page.tsx` | Repo cards grid (replaces current dashboard) |
| `src/app/dashboard/[owner]/[repo]/layout.tsx` | Breadcrumb + tab bar shared across repo detail tabs |
| `src/app/dashboard/[owner]/[repo]/page.tsx` | Issues tab (default) |
| `src/app/dashboard/[owner]/[repo]/analyze/page.tsx` | Analyze tab |
| `src/app/dashboard/[owner]/[repo]/stories/page.tsx` | Stories tab |
| `src/app/dashboard/[owner]/[repo]/pipeline/page.tsx` | Pipeline tab |
| `src/components/repo/repo-card.tsx` | Single repo card for dashboard grid |
| `src/components/repo/config-grid.tsx` | Capability summary grid (Languages, CI, Testing, etc.) |
| `src/components/repo/gap-checklist.tsx` | Gap rows with priority badges + Create Issue buttons |
| `src/components/repo/flow-diagram.tsx` | Vertical flowchart with gates and loops |
| `src/components/repo/audit-form.tsx` | 6 checkboxes + custom agent text area + Generate button |
| `src/components/repo/audit-results.tsx` | Proposed issue list with Create/Create All buttons |
| `src/components/repo/repo-tabs.tsx` | Horizontal tab bar for repo detail |

---

## Chunk 1: Types + API Client

### Task 1: Shared types

**Files:**
- Create: `src/lib/types.ts`

- [ ] **Step 1: Create types file**

```typescript
// src/lib/types.ts

export interface RepoConfig {
  repo: string;
  defaultBranch: string;
  description: string;
  languages: string[];
  monorepo: boolean;
  ci: { supported: boolean; provider?: string; gateCommand?: string; hasMergeQueue?: boolean };
  testing: { supported: boolean; framework?: string; runCommand?: string; hasCoverage?: boolean; coverageThreshold?: number };
  linting: { supported: boolean; tool?: string; runCommand?: string };
  formatting: { supported: boolean; tool?: string };
  typeChecking: { supported: boolean; tool?: string };
  build: { supported: boolean; runCommand?: string };
  reviewBots: { supported: boolean; bots?: string[] };
  docs: { supported: boolean; location?: string | null };
  specManagement: { tracker: string };
  security: { hasEnvExample?: boolean; hasSecurityPolicy?: boolean; hasSecretScanning?: boolean; hasDependencyUpdates?: boolean };
  intelligence: { hasClaudeMd: boolean; hasAgentsMd: boolean; conventions: string[]; ciGateCommand?: string | null };
}

export interface Gap {
  id: string;
  capability: string;
  title: string;
  priority: "critical" | "high" | "medium" | "low";
  description: string;
  status: string;
  issueUrl: string | null;
}

export interface CreatedIssue {
  gapId: string;
  issueNumber: number;
  issueUrl: string;
  entityId?: string;
}

export type AuditCategory = "code_quality" | "security" | "test_coverage" | "ecosystem" | "tech_debt";

export interface ProposedIssue {
  category: AuditCategory;
  title: string;
  priority: "critical" | "high" | "medium" | "low";
  file: string;
  line?: number;
  description: string;
}

export interface AuditResult {
  repoConfigId: string;
  issues: ProposedIssue[];
  categories: AuditCategory[];
}

export interface DesignedFlowState {
  name: string;
  agentRole?: string;
  modelTier?: string;
  mode?: string;
}

export interface DesignedFlowGate {
  name: string;
  type: string;
  primitiveOp?: string;
  timeoutMs?: number;
}

export interface DesignedFlowTransition {
  fromState: string;
  toState: string;
  trigger: string;
}

export interface DesignedFlow {
  flow: { name: string; description: string; initialState: string };
  states: DesignedFlowState[];
  gates: DesignedFlowGate[];
  transitions: DesignedFlowTransition[];
  gateWiring: Record<string, { fromState: string; trigger: string }>;
  notes: string;
}

export interface RepoSummary {
  id: number;
  full_name: string;
  name: string;
  analyzed?: boolean;
  config?: RepoConfig | null;
  inFlight?: number;
  shippedToday?: number;
  openGaps?: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: shared types for repo onboarding UI"
```

### Task 2: API client

**Files:**
- Create: `src/lib/holyship-client.ts`
- Reference: `src/lib/defcon-client.ts` (follow same pattern)

- [ ] **Step 1: Create API client**

```typescript
// src/lib/holyship-client.ts
import type {
  AuditCategory,
  AuditResult,
  CreatedIssue,
  DesignedFlow,
  Gap,
  RepoConfig,
} from "./types";

const BASE = "/api";
const TIMEOUT = 30_000;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(TIMEOUT),
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

// Interrogation
export function interrogateRepo(owner: string, repo: string) {
  return request<{ repoConfigId: string; config: RepoConfig; gaps: { capability: string; title: string; priority: string }[]; hasClaudeMd: boolean }>(
    `/repos/${owner}/${repo}/interrogate`,
    { method: "POST" },
  );
}

export function getRepoConfig(owner: string, repo: string) {
  return request<{ id: string; config: RepoConfig; claudeMd: string | null }>(
    `/repos/${owner}/${repo}/config`,
  ).catch(() => null);
}

export function getRepoGaps(owner: string, repo: string) {
  return request<{ repo: string; gaps: Gap[] }>(
    `/repos/${owner}/${repo}/gaps`,
  ).then((r) => r.gaps);
}

export function createIssueFromGap(owner: string, repo: string, gapId: string, createEntity = false) {
  return request<CreatedIssue>(
    `/repos/${owner}/${repo}/gaps/${gapId}/create-issue`,
    { method: "POST", body: JSON.stringify({ create_entity: createEntity }) },
  );
}

export function createAllIssues(owner: string, repo: string, createEntity = false) {
  return request<{ created: number; issues: CreatedIssue[] }>(
    `/repos/${owner}/${repo}/gaps/create-all`,
    { method: "POST", body: JSON.stringify({ create_entity: createEntity }) },
  );
}

// Audit
export function runAudit(owner: string, repo: string, categories: AuditCategory[], customInstructions?: string) {
  return request<AuditResult>(
    `/repos/${owner}/${repo}/audit`,
    { method: "POST", body: JSON.stringify({ categories, custom_instructions: customInstructions }) },
  );
}

// Flow design
export function designFlow(owner: string, repo: string) {
  return request<DesignedFlow>(
    `/repos/${owner}/${repo}/design-flow`,
    { method: "POST" },
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/holyship-client.ts
git commit -m "feat: holyship API client for interrogation, audit, gaps, flow"
```

---

## Chunk 2: Dashboard — Repo Cards Grid

### Task 3: Repo card component

**Files:**
- Create: `src/components/repo/repo-card.tsx`

- [ ] **Step 1: Create repo card**

A card showing repo name, status badge, summary, and stats. Clicking navigates to repo detail. Follow existing card patterns from `src/components/ui/card.tsx`.

Props: `repo: RepoSummary`. Link wraps the whole card to `/dashboard/${repo.full_name}`.

Status badge: green "Analyzed" if `repo.analyzed`, amber "Not Analyzed" otherwise. Stats line shows `inFlight`, `shippedToday`, `openGaps` if analyzed, or "Click to analyze →" if not.

- [ ] **Step 2: Commit**

```bash
git add src/components/repo/repo-card.tsx
git commit -m "feat: repo card component"
```

### Task 4: Dashboard page

**Files:**
- Modify: `src/app/dashboard/page.tsx` (replace current content)

- [ ] **Step 1: Replace dashboard with repo grid**

"use client" page. Fetches `/api/github/repos` on mount (same as current). For each repo, also fetches `/api/repos/:owner/:repo/config` to check analysis status. Renders a 2-column grid of `RepoCard` components. Includes "+ Connect a repo" dashed card at the end linking to `/connect`.

Header: "Your Repos" + "+ Connect Repo" link.

- [ ] **Step 2: Verify locally**

Run: `pnpm dev` and visit `http://localhost:3000/dashboard`

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat: dashboard repo cards grid"
```

---

## Chunk 3: Repo Detail Layout + Tabs

### Task 5: Tab navigation component

**Files:**
- Create: `src/components/repo/repo-tabs.tsx`

- [ ] **Step 1: Create tab bar**

Props: `owner: string, repo: string, activeTab: "issues" | "analyze" | "stories" | "pipeline"`.

Renders horizontal tab bar with 4 tabs. Active tab has green text + green bottom border. Uses Next.js `Link` for each tab:
- Issues → `/dashboard/${owner}/${repo}`
- Analyze → `/dashboard/${owner}/${repo}/analyze`
- Stories → `/dashboard/${owner}/${repo}/stories`
- Pipeline → `/dashboard/${owner}/${repo}/pipeline`

- [ ] **Step 2: Commit**

```bash
git add src/components/repo/repo-tabs.tsx
git commit -m "feat: repo tab navigation component"
```

### Task 6: Repo detail layout

**Files:**
- Create: `src/app/dashboard/[owner]/[repo]/layout.tsx`

- [ ] **Step 1: Create shared layout**

Server component. Receives `params.owner` and `params.repo` from the URL. Renders:
1. Breadcrumb: `Dashboard › owner/repo` (Dashboard links to `/dashboard`)
2. `RepoTabs` component (needs to detect active tab from pathname — pass it down or let tabs use `usePathname`)
3. `{children}` below

Note: `RepoTabs` uses `usePathname` so it must be "use client". The layout itself can be a server component that renders the breadcrumb and the client tab bar.

- [ ] **Step 2: Commit**

```bash
git add src/app/dashboard/\[owner\]/\[repo\]/layout.tsx
git commit -m "feat: repo detail layout with breadcrumb and tabs"
```

---

## Chunk 4: Issues Tab

### Task 7: Issues tab page

**Files:**
- Create: `src/app/dashboard/[owner]/[repo]/page.tsx`

- [ ] **Step 1: Create issues tab**

"use client" page. Receives `owner` and `repo` from params. Fetches `/api/github/issues?repo=${owner}/${repo}` on mount. Renders:
1. Stats row (3 cards): In Flight, Shipped Today, Credits Burned (same as current dashboard)
2. Issue list with Ship It buttons (same pattern as current dashboard, but no repo selector needed)

Reuse the `shipIssue` function pattern from the current `src/app/dashboard/page.tsx`.

- [ ] **Step 2: Verify locally**

Visit `http://localhost:3000/dashboard/acme/api` — should show issues tab with Ship It buttons.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/\[owner\]/\[repo\]/page.tsx
git commit -m "feat: repo detail issues tab"
```

---

## Chunk 5: Analyze Tab

### Task 8: Config grid component

**Files:**
- Create: `src/components/repo/config-grid.tsx`

- [ ] **Step 1: Create config grid**

Props: `config: RepoConfig`. Renders a 3-column grid of capability cards. Each card has:
- Label (uppercase, muted): "Languages", "CI", "Testing", "Linter", "Docs", "Merge Queue"
- Value: the tool/framework name if supported, or "None" if not
- Color: green checkmark if supported, red X if not

Map RepoConfig fields to cards:
- Languages → `config.languages.join(", ")`
- CI → `config.ci.provider` + " ✓" or "None ✗"
- Testing → `config.testing.framework` + coverage if available
- Linter → `config.linting.tool` or "None"
- Docs → `config.docs.location` or "None"
- Merge Queue → "Enabled ✓" if `config.ci.hasMergeQueue`, else "None"

- [ ] **Step 2: Commit**

```bash
git add src/components/repo/config-grid.tsx
git commit -m "feat: repo config summary grid component"
```

### Task 9: Gap checklist component

**Files:**
- Create: `src/components/repo/gap-checklist.tsx`

- [ ] **Step 1: Create gap checklist**

Props: `gaps: Gap[], owner: string, repo: string, onGapCreated: (gapId: string, issue: CreatedIssue) => void`.

Renders:
- Header: "N Gaps Found" + "Create All Issues" button
- Each gap as a row: priority badge (HIGH=red, MED=amber, LOW=gray) + title + "Create Issue" button
- When a gap has `status === "issue_created"`, button shows "Created ✓" as a green link to `gap.issueUrl`
- "Create All Issues" calls `createAllIssues(owner, repo)` and updates state

Priority badge colors:
- critical/high: `bg-red-500/15 text-red-400`
- medium: `bg-amber-500/15 text-amber-400`
- low: `bg-zinc-500/15 text-zinc-400`

Uses `createIssueFromGap` and `createAllIssues` from holyship-client.

- [ ] **Step 2: Commit**

```bash
git add src/components/repo/gap-checklist.tsx
git commit -m "feat: gap checklist with Create Issue buttons"
```

### Task 10: Flow diagram component

**Files:**
- Create: `src/components/repo/flow-diagram.tsx`

- [ ] **Step 1: Create vertical flowchart**

Props: `flow: DesignedFlow`.

Renders the vertical flowchart (option A from brainstorming):
- Each state as a colored pill (blue for active, amber for fix, green for done)
- Arrows (↓) between states
- Gate icons (🔒) with gate name on gated transitions
- Review ↔ fix shown side-by-side with bidirectional arrows
- Signal labels on transitions
- Design notes below the diagram
- "Activate Flow" button

Build the gate wiring map: for each transition, check if `flow.gateWiring` has a matching entry. If so, show the gate icon between the states.

Detect the review↔fix loop: if there are transitions review→fix AND fix→review, render them side-by-side instead of vertically.

- [ ] **Step 2: Commit**

```bash
git add src/components/repo/flow-diagram.tsx
git commit -m "feat: vertical flow diagram with gates and loops"
```

### Task 11: Analyze page

**Files:**
- Create: `src/app/dashboard/[owner]/[repo]/analyze/page.tsx`

- [ ] **Step 1: Create analyze page**

"use client" page. Two states based on whether config exists:

**Not analyzed:** Centered empty state with Analyze Repo button. On click, calls `interrogateRepo(owner, repo)`. Shows spinner while running. Shows warning about Stories/Pipeline being unavailable.

**Analyzed:** Scrollable page with three sections:
1. `ConfigGrid` with the repo config
2. `GapChecklist` with gaps
3. `FlowDiagram` with the designed flow (fetched via `designFlow` if not cached)
4. "Re-analyze" button at bottom

On mount: fetch `getRepoConfig(owner, repo)` and `getRepoGaps(owner, repo)`.

- [ ] **Step 2: Verify locally**

Visit `http://localhost:3000/dashboard/acme/api/analyze`

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/\[owner\]/\[repo\]/analyze/page.tsx
git commit -m "feat: analyze tab with config, gaps, and flow"
```

---

## Chunk 6: Stories Tab

### Task 12: Audit form component

**Files:**
- Create: `src/components/repo/audit-form.tsx`

- [ ] **Step 1: Create audit form**

Props: `onSubmit: (categories: AuditCategory[], customInstructions?: string) => void, loading: boolean`.

6 checkboxes with colored accents:
1. Code Quality (green, `--accent-green`)
2. Security (red, `--accent-red`)
3. Test Coverage (blue, `--accent-blue`)
4. Ecosystem (amber, `--accent-amber`)
5. Tech Debt (gray, `text-zinc-400`)
6. Custom Agent (purple, `text-purple-400`)

Each checkbox row: colored checkbox + title (bold) + description (muted).

Custom Agent: when checked, expands to reveal a text area below the description. When unchecked, text area is hidden.

"Generate Stories" button at bottom, full width, green. Disabled when no checkboxes are checked or `loading` is true.

State: `checkedCategories: Set<AuditCategory>`, `customChecked: boolean`, `customText: string`.

- [ ] **Step 2: Commit**

```bash
git add src/components/repo/audit-form.tsx
git commit -m "feat: audit form with 6 checkboxes and custom agent"
```

### Task 13: Audit results component

**Files:**
- Create: `src/components/repo/audit-results.tsx`

- [ ] **Step 1: Create results list**

Props: `issues: ProposedIssue[], owner: string, repo: string, onRerun: () => void`.

Renders:
1. Priority summary bar: colored pills with counts (e.g., "1 critical", "2 high", "3 medium", "1 low")
2. Issue list: each row has:
   - Priority badge (same colors as gap checklist)
   - Category tag (colored by category)
   - Title
   - File:line reference (muted, monospace)
   - "Create Issue" button
3. Bottom bar: "Re-run Audit" | "Create All Issues" | "Create All & Ship"

"Create All & Ship" calls `createAllIssues(owner, repo, true)` — the `true` flag creates engineering flow entities.

Category tag colors:
- code_quality: green
- security: red
- test_coverage: blue
- ecosystem: amber
- tech_debt: gray
- custom: purple

- [ ] **Step 2: Commit**

```bash
git add src/components/repo/audit-results.tsx
git commit -m "feat: audit results list with Create Issue buttons"
```

### Task 14: Stories page

**Files:**
- Create: `src/app/dashboard/[owner]/[repo]/stories/page.tsx`

- [ ] **Step 1: Create stories page**

"use client" page. Three states:

**Not analyzed:** Message "Run Analyze first" with link to Analyze tab.

**Input (no results yet):** `AuditForm` component. On submit, calls `runAudit(owner, repo, categories, customInstructions)`. Shows loading state on the Generate button.

**Results:** `AuditResults` component below the form. "Re-run Audit" resets to input state.

On mount: check if analyzed by fetching `getRepoConfig(owner, repo)`. If null, show not-analyzed state.

- [ ] **Step 2: Verify locally**

Visit `http://localhost:3000/dashboard/acme/api/stories`

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/\[owner\]/\[repo\]/stories/page.tsx
git commit -m "feat: stories tab with audit form and results"
```

---

## Chunk 7: Pipeline Tab + Nav Update

### Task 15: Pipeline tab

**Files:**
- Create: `src/app/dashboard/[owner]/[repo]/pipeline/page.tsx`
- Reference: `src/app/settings/pipeline/page.tsx`

- [ ] **Step 1: Move pipeline settings to repo detail**

Copy the existing pipeline settings page content into the new repo-scoped page. The component logic stays the same (stage toggles, approval gates, presets). Update the tRPC fetch URL to scope by repo if needed, or keep as-is since the flow is global for now.

- [ ] **Step 2: Commit**

```bash
git add src/app/dashboard/\[owner\]/\[repo\]/pipeline/page.tsx
git commit -m "feat: pipeline tab in repo detail"
```

### Task 16: Update nav

**Files:**
- Modify: `src/components/ui/nav.tsx`

- [ ] **Step 1: Simplify nav**

Keep: Dashboard, Approvals, Billing, Settings. Remove any repo-specific items if present. The nav is now just global items — repo-specific navigation lives in the repo detail tabs.

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/nav.tsx
git commit -m "refactor: simplify nav to global items only"
```

### Task 17: Final verification

- [ ] **Step 1: Run checks**

```bash
cd ~/holyship-platform-ui
pnpm check
```

- [ ] **Step 2: Manual smoke test**

1. Visit `/dashboard` — see repo cards
2. Click a repo → see breadcrumb + tabs
3. Issues tab → issue list with Ship It
4. Analyze tab → config grid + gaps + flow
5. Stories tab → 6 checkboxes
6. Pipeline tab → stage toggles

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: address check issues"
```

- [ ] **Step 4: Push and PR**

```bash
git push -u origin feat/repo-onboarding-ui
gh pr create --title "feat: repo onboarding UI — dashboard, analyze, stories, pipeline" --body "..."
```
