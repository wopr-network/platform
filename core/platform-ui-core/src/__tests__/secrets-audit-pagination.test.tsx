import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Mock framer-motion to avoid animation issues in tests
vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: {
    div: ({ children, ...props }: Record<string, unknown>) => {
      const { initial, animate, exit, transition, ...rest } = props;
      void initial;
      void animate;
      void exit;
      void transition;
      return (
        <div {...(rest as React.HTMLAttributes<HTMLDivElement>)}>{children as React.ReactNode}</div>
      );
    },
  },
}));

// Mock the API module
vi.mock("@/lib/api", () => ({
  listSecrets: vi.fn().mockResolvedValue([
    {
      id: "sec-1",
      name: "Test Secret",
      type: "api-token",
      createdAt: "2026-01-01T00:00:00Z",
      lastUsedAt: null,
      expiresAt: null,
    },
  ]),
  createSecret: vi.fn(),
  deleteSecret: vi.fn(),
  rotateSecret: vi.fn(),
  fetchSecretAudit: vi.fn(),
  apiFetch: vi.fn(),
}));

import { fetchSecretAudit } from "@/lib/api";

// Generate N audit entries
function makeEntries(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `audit-${i}`,
    secretId: "sec-1",
    action: "accessed" as const,
    actorType: "plugin" as const,
    actorName: `Actor ${i}`,
    timestamp: new Date(2026, 0, 1, 0, i).toISOString(),
  }));
}

describe("AuditPanel pagination", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows only 10 entries initially and a Load more button when >10 exist", async () => {
    const user = userEvent.setup();
    const entries = makeEntries(25);
    vi.mocked(fetchSecretAudit).mockResolvedValue(entries);

    const { default: SecretsPage } = await import("@/app/(dashboard)/settings/secrets/page");
    render(<SecretsPage />);

    // Wait for secrets to load, then click audit toggle
    const auditBtn = await screen.findByRole("button", { name: /access log/i });
    await user.click(auditBtn);

    // Should show first 10
    await screen.findByText("Actor 0");
    expect(screen.getByText("Actor 9")).toBeInTheDocument();
    expect(screen.queryByText("Actor 10")).not.toBeInTheDocument();

    // Should show load more button
    const loadMore = screen.getByRole("button", { name: /load \d+ more/i });
    expect(loadMore).toBeInTheDocument();
  });

  it("loads 10 more entries on click", async () => {
    const user = userEvent.setup();
    const entries = makeEntries(25);
    vi.mocked(fetchSecretAudit).mockResolvedValue(entries);

    const { default: SecretsPage } = await import("@/app/(dashboard)/settings/secrets/page");
    render(<SecretsPage />);

    const auditBtn = await screen.findByRole("button", { name: /access log/i });
    await user.click(auditBtn);
    await screen.findByText("Actor 0");

    const loadMore = screen.getByRole("button", { name: /load \d+ more/i });
    await user.click(loadMore);

    // Now 20 visible
    expect(screen.getByText("Actor 19")).toBeInTheDocument();
    expect(screen.queryByText("Actor 20")).not.toBeInTheDocument();
  });

  it("hides Load more button when all entries are visible", async () => {
    const user = userEvent.setup();
    const entries = makeEntries(15);
    vi.mocked(fetchSecretAudit).mockResolvedValue(entries);

    const { default: SecretsPage } = await import("@/app/(dashboard)/settings/secrets/page");
    render(<SecretsPage />);

    const auditBtn = await screen.findByRole("button", { name: /access log/i });
    await user.click(auditBtn);
    await screen.findByText("Actor 0");

    const loadMore = screen.getByRole("button", { name: /load \d+ more/i });
    await user.click(loadMore);

    // All 15 visible now
    expect(screen.getByText("Actor 14")).toBeInTheDocument();
    // No more button
    expect(screen.queryByRole("button", { name: /load \d+ more/i })).not.toBeInTheDocument();
  });

  it("does not show Load more button when <=10 entries", async () => {
    const user = userEvent.setup();
    const entries = makeEntries(5);
    vi.mocked(fetchSecretAudit).mockResolvedValue(entries);

    const { default: SecretsPage } = await import("@/app/(dashboard)/settings/secrets/page");
    render(<SecretsPage />);

    const auditBtn = await screen.findByRole("button", { name: /access log/i });
    await user.click(auditBtn);
    await screen.findByText("Actor 0");

    expect(screen.queryByRole("button", { name: /load \d+ more/i })).not.toBeInTheDocument();
  });
});
