# Paperclip Dashboard Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the inherited WOPR instance list with an adaptive hero/grid dashboard that shows Paperclip instances as cards linked to their `*.runpaperclip.com` subdomains.

**Architecture:** A single `PaperclipDashboard` client component replaces core's `InstanceListClient`. It uses the same `trpc.fleet.listInstances` query but renders cards instead of a table. One Paperclip = hero card. Multiple = card grid with a `+` card for adding more. The `+` card has an inline name input — no separate create page.

**Tech Stack:** React 19, Next.js 16 App Router, tRPC (via `@core/lib/trpc`), Tailwind CSS v4, lucide-react icons, sonner toasts, framer-motion for card transitions.

**Spec:** `docs/superpowers/specs/2026-03-12-paperclip-dashboard-design.md`

**Design Language: "Warm Terminal"**
- All monospace (JetBrains Mono, already set in root layout)
- Dark-first palette: slate backgrounds, amber-400/500 primary accent (warm brass paperclip)
- Status colors: emerald pulse for running, zinc for stopped, red for error
- Cards: gradient border glow on hover, subtle depth via layered shadows
- Hero card running state: animated gradient sweep on top border (heartbeat)
- Status dot: CSS pulse animation when running
- `+` card: icon rotates 90deg on hover
- Status labels: uppercase, letter-spaced, small

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/components/paperclip-card.tsx` | Single Paperclip instance card — name, pulsing status dot, subdomain link, settings gear. Clickable card surface opens subdomain. Hero and grid variants. |
| Create | `src/components/add-paperclip-card.tsx` | The `+` card with rotating icon, inline name input, card and link variants |
| Create | `src/components/paperclip-dashboard.tsx` | Adaptive hero/grid layout, data fetching via tRPC, error/loading states |
| Modify | `src/app/instances/page.tsx` | Swap `InstanceListClient` for `PaperclipDashboard` |
| Modify | `src/app/instances/new/page.tsx` | Redirect to `/instances` (no standalone create page) |
| Create | `src/__tests__/setup.ts` | Test setup: stub fetch, polyfill IntersectionObserver/matchMedia |
| Create | `src/__tests__/paperclip-card.test.tsx` | Tests for PaperclipCard |
| Create | `src/__tests__/add-paperclip-card.test.tsx` | Tests for AddPaperclipCard |
| Create | `src/__tests__/paperclip-dashboard.test.tsx` | Tests for PaperclipDashboard (hero/grid/loading/error/empty) |
| Create | `vitest.config.ts` | Vitest config with jsdom, `@core` and `@/` aliases |

---

## Task 0: Test Infrastructure

**Files:**
- Create: `vitest.config.ts`
- Create: `src/__tests__/setup.ts`
- Modify: `package.json` (add test deps + script)

- [ ] **Step 1: Add test dependencies**

```bash
cd /home/tsavo/paperclip-platform-ui
npm install -D vitest @vitejs/plugin-react @vitest/coverage-v8 jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
npm install @tanstack/react-query
```

Note: `@tanstack/react-query` goes in `dependencies` because the dashboard test needs `QueryClientProvider` and the component runs inside one at runtime.

- [ ] **Step 2: Create vitest.config.ts**

```ts
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      "@core": resolve(__dirname, "./node_modules/@wopr-network/platform-ui-core/src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["src/__tests__/setup.ts"],
    exclude: ["node_modules"],
    testTimeout: 15000,
  },
});
```

- [ ] **Step 3: Create test setup file**

```ts
// src/__tests__/setup.ts
import "@testing-library/jest-dom/vitest";

// Reject all fetch by default — tests must explicitly stub
vi.stubGlobal(
  "fetch",
  vi.fn(() => Promise.reject(new Error("fetch not stubbed"))),
);

// Polyfill IntersectionObserver
vi.stubGlobal(
  "IntersectionObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

// Polyfill matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("dark"),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
```

- [ ] **Step 4: Add test script to package.json**

Add to `scripts`:
```json
"test": "vitest run"
```

- [ ] **Step 5: Verify setup compiles**

Run: `cd /home/tsavo/paperclip-platform-ui && npx vitest run`
Expected: "No test files found" (no error)

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts src/__tests__/setup.ts package.json package-lock.json
git commit -m "chore: add vitest test infrastructure"
```

---

## Task 1: PaperclipCard Component

**Files:**
- Create: `src/components/paperclip-card.tsx`
- Create: `src/__tests__/paperclip-card.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/__tests__/paperclip-card.test.tsx
import { render, screen } from "@testing-library/react";
import { PaperclipCard } from "@/components/paperclip-card";

const mockInstance = {
  id: "inst-1",
  name: "my-bot",
  status: "running" as const,
  subdomain: "my-bot.runpaperclip.com",
};

describe("PaperclipCard", () => {
  it("renders instance name", () => {
    render(<PaperclipCard instance={mockInstance} />);
    expect(screen.getByText("my-bot")).toBeInTheDocument();
  });

  it("renders subdomain as a link that opens in new tab", () => {
    render(<PaperclipCard instance={mockInstance} />);
    const link = screen.getByRole("link", { name: /my-bot\.runpaperclip\.com/i });
    expect(link).toHaveAttribute("href", "https://my-bot.runpaperclip.com");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("makes the entire card surface clickable to the subdomain", () => {
    const { container } = render(<PaperclipCard instance={mockInstance} />);
    // The outer card element should be an anchor to the subdomain
    const cardLink = container.querySelector("a[href='https://my-bot.runpaperclip.com']");
    expect(cardLink).not.toBeNull();
  });

  it("renders RUNNING status label uppercase", () => {
    render(<PaperclipCard instance={mockInstance} />);
    expect(screen.getByText("RUNNING")).toBeInTheDocument();
  });

  it("renders STOPPED status", () => {
    render(
      <PaperclipCard instance={{ ...mockInstance, status: "stopped" }} />,
    );
    expect(screen.getByText("STOPPED")).toBeInTheDocument();
  });

  it("renders ERROR status", () => {
    render(
      <PaperclipCard instance={{ ...mockInstance, status: "error" }} />,
    );
    expect(screen.getByText("ERROR")).toBeInTheDocument();
  });

  it("renders settings link to instance detail page", () => {
    render(<PaperclipCard instance={mockInstance} />);
    const settingsLink = screen.getByRole("link", { name: /settings/i });
    expect(settingsLink).toHaveAttribute("href", "/instances/inst-1");
  });

  it("applies hero variant styling when variant is hero", () => {
    const { container } = render(
      <PaperclipCard instance={mockInstance} variant="hero" />,
    );
    expect(container.firstChild).toHaveClass("max-w-xl");
  });

  it("applies grid variant styling when variant is grid", () => {
    const { container } = render(
      <PaperclipCard instance={mockInstance} variant="grid" />,
    );
    expect(container.firstChild).not.toHaveClass("max-w-xl");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/tsavo/paperclip-platform-ui && npx vitest run src/__tests__/paperclip-card.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement PaperclipCard**

Design: "Warm Terminal" — amber accents, pulsing status dot, gradient border glow on hover, entire card clickable to subdomain. Status labels uppercase and letter-spaced. Hero variant has animated gradient sweep on top border when running.

```tsx
// src/components/paperclip-card.tsx
"use client";

import { Settings } from "lucide-react";
import Link from "next/link";
import { cn } from "@core/lib/utils";

export interface PaperclipInstance {
  id: string;
  name: string;
  status: "running" | "stopped" | "error";
  subdomain: string;
}

const statusConfig = {
  running: {
    label: "RUNNING",
    dot: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]",
    pulse: true,
    text: "text-emerald-400",
    border: "hover:border-emerald-500/30",
    glow: "hover:shadow-[0_0_30px_rgba(52,211,153,0.08)]",
  },
  stopped: {
    label: "STOPPED",
    dot: "bg-zinc-500",
    pulse: false,
    text: "text-zinc-500",
    border: "hover:border-zinc-500/30",
    glow: "hover:shadow-[0_0_30px_rgba(161,161,170,0.05)]",
  },
  error: {
    label: "ERROR",
    dot: "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]",
    pulse: true,
    text: "text-red-400",
    border: "hover:border-red-500/30",
    glow: "hover:shadow-[0_0_30px_rgba(239,68,68,0.08)]",
  },
} as const;

export function PaperclipCard({
  instance,
  variant = "grid",
}: {
  instance: PaperclipInstance;
  variant?: "hero" | "grid";
}) {
  const s = statusConfig[instance.status];
  const isHero = variant === "hero";

  return (
    <div
      className={cn(
        "group relative rounded-lg border border-border/40 bg-card/80 backdrop-blur-sm transition-all duration-300",
        s.border,
        s.glow,
        isHero && "max-w-xl mx-auto",
        isHero ? "p-8" : "p-5",
        // Hero running state: animated gradient top border
        isHero && instance.status === "running" && "overflow-hidden",
      )}
    >
      {/* Animated top border for hero running state */}
      {isHero && instance.status === "running" && (
        <div
          className="absolute inset-x-0 top-0 h-px"
          style={{
            background: "linear-gradient(90deg, transparent, #f59e0b, #34d399, transparent)",
            backgroundSize: "200% 100%",
            animation: "sweep 3s ease-in-out infinite",
          }}
        />
      )}

      {/* Card surface link — opens subdomain */}
      <a
        href={`https://${instance.subdomain}`}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute inset-0 z-0"
        aria-label={`Open ${instance.subdomain}`}
      />

      {/* Status dot + name row */}
      <div className="relative z-10 flex items-center gap-3 mb-3">
        <span
          className={cn(
            "size-2.5 rounded-full flex-shrink-0",
            s.dot,
            s.pulse && "animate-pulse",
          )}
          aria-hidden="true"
        />
        <h2 className={cn(
          "font-semibold tracking-tight truncate",
          isHero ? "text-2xl" : "text-base",
        )}>
          {instance.name}
        </h2>
        <span className={cn(
          "text-[10px] font-medium tracking-[0.15em] uppercase flex-shrink-0",
          s.text,
        )}>
          {s.label}
        </span>
      </div>

      {/* Subdomain */}
      <a
        href={`https://${instance.subdomain}`}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "relative z-10 inline-block font-mono text-muted-foreground/70 group-hover:text-amber-400/80 transition-colors duration-300",
          isHero ? "text-sm" : "text-xs",
        )}
      >
        {instance.subdomain}
      </a>

      {/* Settings gear — stops propagation so it doesn't follow the card link */}
      <Link
        href={`/instances/${instance.id}`}
        className="absolute top-3 right-3 z-20 p-2 rounded-md text-muted-foreground/40 hover:text-amber-400 hover:bg-amber-400/10 transition-all duration-200"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
      >
        <Settings className={cn("transition-transform duration-200 group-hover:rotate-45", isHero ? "size-5" : "size-4")} />
      </Link>
    </div>
  );
}
```

Add the sweep keyframe to `src/app/globals.css` (append to end):

```css
@keyframes sweep {
  0%, 100% { background-position: -200% 0; }
  50% { background-position: 200% 0; }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/tsavo/paperclip-platform-ui && npx vitest run src/__tests__/paperclip-card.test.tsx`
Expected: All 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/paperclip-card.tsx src/__tests__/paperclip-card.test.tsx src/app/globals.css
git commit -m "feat: add PaperclipCard with warm-terminal design, hero/grid variants"
```

---

## Task 2: AddPaperclipCard Component

**Files:**
- Create: `src/components/add-paperclip-card.tsx`
- Create: `src/__tests__/add-paperclip-card.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/__tests__/add-paperclip-card.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddPaperclipCard } from "@/components/add-paperclip-card";

describe("AddPaperclipCard", () => {
  it("renders the + card with prompt text", () => {
    render(<AddPaperclipCard onAdd={vi.fn()} />);
    expect(screen.getByText(/add another paperclip/i)).toBeInTheDocument();
  });

  it("shows name input when clicked", async () => {
    const user = userEvent.setup();
    render(<AddPaperclipCard onAdd={vi.fn()} />);
    await user.click(screen.getByText(/add another paperclip/i));
    expect(screen.getByPlaceholderText(/name/i)).toBeInTheDocument();
  });

  it("calls onAdd with trimmed name on Enter", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddPaperclipCard onAdd={onAdd} />);
    await user.click(screen.getByText(/add another paperclip/i));
    const input = screen.getByPlaceholderText(/name/i);
    await user.type(input, "new-bot{Enter}");
    expect(onAdd).toHaveBeenCalledWith("new-bot");
  });

  it("does not call onAdd with empty name", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddPaperclipCard onAdd={onAdd} />);
    await user.click(screen.getByText(/add another paperclip/i));
    const input = screen.getByPlaceholderText(/name/i);
    await user.type(input, "{Enter}");
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("collapses back on Escape", async () => {
    const user = userEvent.setup();
    render(<AddPaperclipCard onAdd={vi.fn()} />);
    await user.click(screen.getByText(/add another paperclip/i));
    expect(screen.getByPlaceholderText(/name/i)).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByPlaceholderText(/name/i)).not.toBeInTheDocument();
  });

  it("shows loading state when adding is true", () => {
    render(<AddPaperclipCard onAdd={vi.fn()} adding={true} />);
    expect(screen.getByText(/creating/i)).toBeInTheDocument();
  });

  it("renders as subtle link variant without card border", () => {
    const { container } = render(
      <AddPaperclipCard onAdd={vi.fn()} variant="link" />,
    );
    expect(container.querySelector("[class*='border-dashed']")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/tsavo/paperclip-platform-ui && npx vitest run src/__tests__/add-paperclip-card.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement AddPaperclipCard**

Design: Dashed border card with amber accent on hover. Plus icon rotates 90deg on hover. Link variant is a subtle text link. Expanding input has amber underline focus state.

```tsx
// src/components/add-paperclip-card.tsx
"use client";

import { Loader2, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@core/lib/utils";

export function AddPaperclipCard({
  onAdd,
  adding = false,
  variant = "card",
}: {
  onAdd: (name: string) => void;
  adding?: boolean;
  variant?: "card" | "link";
}) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setName("");
    setExpanded(false);
  }

  function expand() {
    setExpanded(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  if (adding) {
    return (
      <div
        className={cn(
          "flex items-center justify-center gap-2 rounded-lg p-6 text-sm text-muted-foreground/60",
          variant === "card" && "border border-dashed border-amber-500/20 bg-amber-500/[0.02]",
        )}
      >
        <Loader2 className="size-4 animate-spin text-amber-400" />
        <span className="font-mono text-xs tracking-wide">Creating...</span>
      </div>
    );
  }

  if (!expanded) {
    return variant === "link" ? (
      <button
        type="button"
        onClick={expand}
        className="font-mono text-xs text-muted-foreground/50 hover:text-amber-400 tracking-wide transition-colors duration-200"
      >
        Add another Paperclip
      </button>
    ) : (
      <button
        type="button"
        onClick={expand}
        className="group/add flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/30 p-6 text-muted-foreground/40 hover:border-amber-500/30 hover:text-amber-400 hover:bg-amber-500/[0.02] transition-all duration-300 cursor-pointer min-h-[120px]"
      >
        <Plus className="size-6 transition-transform duration-300 group-hover/add:rotate-90" />
        <span className="font-mono text-xs tracking-wide">Add another Paperclip</span>
      </button>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg p-6",
        variant === "card" && "border border-dashed border-amber-500/20 bg-amber-500/[0.02]",
      )}
    >
      <input
        ref={inputRef}
        type="text"
        placeholder="Name your Paperclip"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSubmit();
          if (e.key === "Escape") {
            setExpanded(false);
            setName("");
          }
        }}
        className="w-full bg-transparent border-b border-border/30 pb-2 font-mono text-sm outline-none focus:border-amber-400/60 transition-colors duration-200 placeholder:text-muted-foreground/30"
        autoFocus
      />
      <p className="mt-2 font-mono text-[10px] text-muted-foreground/40 tracking-wide">
        ENTER to create &middot; ESC to cancel
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/tsavo/paperclip-platform-ui && npx vitest run src/__tests__/add-paperclip-card.test.tsx`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/add-paperclip-card.tsx src/__tests__/add-paperclip-card.test.tsx
git commit -m "feat: add AddPaperclipCard with amber-accent design, rotating + icon"
```

---

## Task 3: PaperclipDashboard Component

**Files:**
- Create: `src/components/paperclip-dashboard.tsx`
- Create: `src/__tests__/paperclip-dashboard.test.tsx`

- [ ] **Step 1: Write the failing tests**

The dashboard uses `trpc.fleet.listInstances.useQuery`. Mock the tRPC hooks directly — not `@/lib/api`.

```tsx
// src/__tests__/paperclip-dashboard.test.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";

// Mock tRPC
const mockUseQuery = vi.fn();
const mockUseMutation = vi.fn();

vi.mock("@core/lib/trpc", () => ({
  trpc: {
    fleet: {
      listInstances: { useQuery: (...args: unknown[]) => mockUseQuery(...args) },
      createInstance: { useMutation: (...args: unknown[]) => mockUseMutation(...args) },
    },
  },
}));

// Mock framer-motion — render children only, no DOM prop spreading
vi.mock("framer-motion", () => ({
  motion: {
    div: (props: Record<string, unknown>) => {
      const { children } = props;
      return <div>{children as React.ReactNode}</div>;
    },
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  MotionConfig: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock brand config
vi.mock("@core/lib/brand-config", () => ({
  getBrandConfig: () => ({ domain: "runpaperclip.com", productName: "Paperclip" }),
  productName: () => "Paperclip",
}));

// Mock api (mapBotState)
vi.mock("@core/lib/api", () => ({
  mapBotState: (state: string) => {
    if (state === "running") return "running";
    if (state === "error" || state === "dead") return "error";
    return "stopped";
  },
  apiFetch: vi.fn(),
}));

// Mock errors
vi.mock("@core/lib/errors", () => ({
  toUserMessage: (_err: unknown, fallback: string) => fallback,
}));

import { PaperclipDashboard } from "@/components/paperclip-dashboard";

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

const oneBotResponse = {
  bots: [
    {
      id: "inst-1",
      name: "my-bot",
      state: "running",
      env: {},
      uptime: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    },
  ],
};

const twoBotResponse = {
  bots: [
    ...oneBotResponse.bots,
    {
      id: "inst-2",
      name: "second-bot",
      state: "stopped",
      env: {},
      uptime: null,
      createdAt: new Date().toISOString(),
    },
  ],
};

describe("PaperclipDashboard", () => {
  beforeEach(() => {
    mockUseMutation.mockReturnValue({ mutate: vi.fn(), isPending: false });
  });

  it("shows loading state while fetching", () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true, error: null });
    renderWithQueryClient(<PaperclipDashboard />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("shows error state on query failure", () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Network error"),
      refetch: vi.fn(),
    });
    renderWithQueryClient(<PaperclipDashboard />);
    expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
  });

  it("shows empty state when no instances exist", () => {
    mockUseQuery.mockReturnValue({
      data: { bots: [] },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    renderWithQueryClient(<PaperclipDashboard />);
    expect(screen.getByText(/no paperclips yet/i)).toBeInTheDocument();
    expect(screen.getByText(/your organization will be created/i)).toBeInTheDocument();
  });

  it("renders hero card for single instance", () => {
    mockUseQuery.mockReturnValue({
      data: oneBotResponse,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    renderWithQueryClient(<PaperclipDashboard />);
    expect(screen.getByText("my-bot")).toBeInTheDocument();
    expect(screen.getByText(/my-bot\.runpaperclip\.com/)).toBeInTheDocument();
    // Hero mode shows subtle "Add another" link, not a card
    expect(screen.getByText(/add another paperclip/i)).toBeInTheDocument();
  });

  it("renders card grid for multiple instances", () => {
    mockUseQuery.mockReturnValue({
      data: twoBotResponse,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    renderWithQueryClient(<PaperclipDashboard />);
    expect(screen.getByText("my-bot")).toBeInTheDocument();
    expect(screen.getByText("second-bot")).toBeInTheDocument();
  });

  it("shows search only at 5+ instances", () => {
    mockUseQuery.mockReturnValue({
      data: twoBotResponse,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    renderWithQueryClient(<PaperclipDashboard />);
    expect(screen.queryByPlaceholderText(/search/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/tsavo/paperclip-platform-ui && npx vitest run src/__tests__/paperclip-dashboard.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement PaperclipDashboard**

Design: Monospace headings, amber-tinted subtitle, clean layout with generous spacing. Loading state uses amber spinner. Error state is warm red with monospace text.

```tsx
// src/components/paperclip-dashboard.tsx
"use client";

import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { getBrandConfig } from "@core/lib/brand-config";
import { toUserMessage } from "@core/lib/errors";
import type { BotStatusResponse } from "@core/lib/api";
import { mapBotState } from "@core/lib/api";
import { trpc } from "@core/lib/trpc";
import { Input } from "@core/components/ui/input";
import { AddPaperclipCard } from "./add-paperclip-card";
import { PaperclipCard, type PaperclipInstance } from "./paperclip-card";

export function PaperclipDashboard() {
  const brand = getBrandConfig();
  const [search, setSearch] = useState("");

  const {
    data: rawData,
    isLoading,
    error: queryError,
    refetch,
  } = trpc.fleet.listInstances.useQuery(undefined, { refetchInterval: 30_000 });

  const createMutation = trpc.fleet.createInstance.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Paperclip created!");
    },
    onError: (err: unknown) => {
      toast.error(toUserMessage(err, "Failed to create Paperclip"));
    },
  });

  const instances: PaperclipInstance[] = useMemo(() => {
    const bots = (rawData as { bots?: BotStatusResponse[] } | undefined)?.bots;
    if (!Array.isArray(bots)) return [];
    return bots.map((bot) => ({
      id: bot.id,
      name: bot.name,
      status: mapBotState(bot.state),
      subdomain: `${bot.name}.${brand.domain}`,
    }));
  }, [rawData, brand.domain]);

  const filtered = useMemo(() => {
    if (!search) return instances;
    return instances.filter((i) =>
      i.name.toLowerCase().includes(search.toLowerCase()),
    );
  }, [instances, search]);

  function handleAdd(name: string) {
    createMutation.mutate({
      name,
      provider: "default",
      channels: [],
      plugins: [],
    });
  }

  /* --- Loading --- */
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground/50">
        <Loader2 className="size-5 animate-spin text-amber-400/60 mr-3" />
        <span className="font-mono text-sm tracking-wide">Loading your Paperclips...</span>
      </div>
    );
  }

  /* --- Error --- */
  if (queryError) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24">
        <p className="font-mono text-sm text-red-400/80">
          Failed to load your Paperclips.
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="font-mono text-xs text-muted-foreground/50 hover:text-amber-400 tracking-wide transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  const isHero = instances.length === 1;
  const showSearch = instances.length >= 5;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Your Paperclips
        </h1>
        <p className="font-mono text-xs text-amber-400/50 tracking-wide mt-1">
          {instances.length === 0
            ? "AWAITING PROVISIONING"
            : instances.length === 1
              ? "YOUR ORGANIZATION IS RUNNING"
              : `${instances.length} ORGANIZATIONS`}
        </p>
      </div>

      {/* Search — only at 5+ */}
      {showSearch && (
        <Input
          placeholder="Search Paperclips..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm font-mono text-sm"
        />
      )}

      {/* Hero mode: single centered card + subtle add link */}
      {isHero && (
        <div className="flex flex-col items-center gap-8 py-10">
          <PaperclipCard instance={instances[0]} variant="hero" />
          <AddPaperclipCard
            onAdd={handleAdd}
            adding={createMutation.isPending}
            variant="link"
          />
        </div>
      )}

      {/* Grid mode: card grid + add card */}
      {!isHero && instances.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((inst) => (
            <PaperclipCard key={inst.id} instance={inst} variant="grid" />
          ))}
          <AddPaperclipCard
            onAdd={handleAdd}
            adding={createMutation.isPending}
            variant="card"
          />
        </div>
      )}

      {/* Empty state — should not normally happen (signup auto-provisions) */}
      {instances.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 py-24 text-muted-foreground/40">
          <p className="font-mono text-sm">No Paperclips yet.</p>
          <p className="font-mono text-[10px] tracking-wide">
            YOUR ORGANIZATION WILL BE CREATED WHEN YOUR ACCOUNT IS PROVISIONED
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/tsavo/paperclip-platform-ui && npx vitest run src/__tests__/paperclip-dashboard.test.tsx`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/paperclip-dashboard.tsx src/__tests__/paperclip-dashboard.test.tsx
git commit -m "feat: add PaperclipDashboard with adaptive hero/grid layout"
```

---

## Task 4: Wire Up Pages

**Files:**
- Modify: `src/app/instances/page.tsx`
- Modify: `src/app/instances/new/page.tsx`

- [ ] **Step 1: Update instances page to use PaperclipDashboard**

Replace contents of `src/app/instances/page.tsx`:

```tsx
import { PaperclipDashboard } from "@/components/paperclip-dashboard";

export default function InstancesPage() {
  return (
    <div className="p-6">
      <PaperclipDashboard />
    </div>
  );
}
```

- [ ] **Step 2: Redirect /instances/new to /instances**

Replace contents of `src/app/instances/new/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default function NewInstancePage() {
  redirect("/instances");
}
```

- [ ] **Step 3: Run all tests**

Run: `cd /home/tsavo/paperclip-platform-ui && npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Run type check**

Run: `cd /home/tsavo/paperclip-platform-ui && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/app/instances/page.tsx src/app/instances/new/page.tsx
git commit -m "feat: wire PaperclipDashboard into instances pages, redirect /new"
```

---

## Task 5: Final Verification

- [ ] **Step 1: Run full check**

```bash
cd /home/tsavo/paperclip-platform-ui
npm run check && npm test
```

Expected: biome check + tsc pass, all tests pass

- [ ] **Step 2: Verify build**

```bash
cd /home/tsavo/paperclip-platform-ui
npm run build
```

Expected: Build succeeds (may need API server for full build; `tsc --noEmit` is the real gate)
