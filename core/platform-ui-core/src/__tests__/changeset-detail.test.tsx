import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChangesetDetailClient } from "../app/(dashboard)/changesets/[id]/changeset-detail-client";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn().mockReturnValue({ push: vi.fn(), back: vi.fn() }),
}));

const mockChangeset = {
  id: "cs-001",
  title: "Add user authentication",
  description: "Implements OAuth2 login flow",
  status: "open" as const,
  reviewStatus: "pending" as const,
  author: "alice",
  sourceBranch: "feature/auth",
  targetBranch: "main",
  createdAt: "2026-03-01T10:00:00Z",
  updatedAt: "2026-03-02T14:00:00Z",
  mergedAt: null,
  files: [
    {
      path: "src/auth.ts",
      status: "added" as const,
      additions: 45,
      deletions: 0,
      patch: "+export function login() {}",
    },
    {
      path: "src/config.ts",
      status: "modified" as const,
      additions: 3,
      deletions: 1,
      patch: null,
    },
  ],
  reviews: [
    {
      id: "rev-1",
      author: "bob",
      status: "approved" as const,
      body: "LGTM",
      createdAt: "2026-03-02T12:00:00Z",
    },
  ],
  comments: [
    {
      id: "cmt-1",
      author: "carol",
      body: "Nice work",
      filePath: "src/auth.ts",
      lineNumber: 10,
      createdAt: "2026-03-02T13:00:00Z",
    },
  ],
  totalAdditions: 48,
  totalDeletions: 1,
};

const mockGetChangeset = vi.fn().mockResolvedValue(mockChangeset);

vi.mock("@/lib/changeset-api", () => ({
  getChangeset: (...args: unknown[]) => mockGetChangeset(...args),
}));

describe("ChangesetDetailClient", () => {
  it("renders changeset title and status", async () => {
    render(<ChangesetDetailClient changesetId="cs-001" />);
    await waitFor(() => {
      expect(screen.getByText("Add user authentication")).toBeInTheDocument();
    });
    expect(screen.getByText("open")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("shows file changes in files tab", async () => {
    render(<ChangesetDetailClient changesetId="cs-001" />);
    await waitFor(() => {
      expect(screen.getByText("src/auth.ts")).toBeInTheDocument();
    });
    expect(screen.getByText("src/config.ts")).toBeInTheDocument();
    expect(screen.getByText("+48")).toBeInTheDocument();
    expect(screen.getAllByText("-1").length).toBeGreaterThanOrEqual(1);
  });

  it("shows reviews tab content", async () => {
    const user = userEvent.setup();
    render(<ChangesetDetailClient changesetId="cs-001" />);
    await waitFor(() => {
      expect(screen.getByText("Add user authentication")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("tab", { name: /reviews/i }));
    await waitFor(() => {
      expect(screen.getByText("bob")).toBeInTheDocument();
    });
    expect(screen.getByText("LGTM")).toBeInTheDocument();
  });

  it("shows comments tab content", async () => {
    const user = userEvent.setup();
    render(<ChangesetDetailClient changesetId="cs-001" />);
    await waitFor(() => {
      expect(screen.getByText("Add user authentication")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("tab", { name: /comments/i }));
    await waitFor(() => {
      expect(screen.getByText("carol")).toBeInTheDocument();
    });
    expect(screen.getByText("Nice work")).toBeInTheDocument();
  });

  it("shows metadata (author, branches)", async () => {
    render(<ChangesetDetailClient changesetId="cs-001" />);
    await waitFor(() => {
      expect(screen.getByText("alice")).toBeInTheDocument();
    });
    expect(screen.getByText(/feature\/auth/)).toBeInTheDocument();
    expect(screen.getByText(/main/)).toBeInTheDocument();
  });

  it("renders loading skeletons initially", () => {
    mockGetChangeset.mockReturnValueOnce(
      new Promise(() => {
        /* never resolves */
      }),
    );
    const { container } = render(<ChangesetDetailClient changesetId="cs-001" />);
    const skeletons = container.querySelectorAll("[data-slot='skeleton']");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders error state on API failure", async () => {
    mockGetChangeset.mockRejectedValueOnce(new Error("Not found"));
    render(<ChangesetDetailClient changesetId="cs-001" />);
    await waitFor(() => {
      expect(screen.getByText("Not found")).toBeInTheDocument();
    });
    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("retry button re-fetches changeset", async () => {
    const user = userEvent.setup();
    mockGetChangeset.mockRejectedValueOnce(new Error("Network error"));
    render(<ChangesetDetailClient changesetId="cs-001" />);
    await waitFor(() => {
      expect(screen.getByText("Retry")).toBeInTheDocument();
    });
    const callCount = mockGetChangeset.mock.calls.length;
    mockGetChangeset.mockResolvedValueOnce(mockChangeset);
    await user.click(screen.getByText("Retry"));
    await waitFor(() => {
      expect(mockGetChangeset).toHaveBeenCalledTimes(callCount + 1);
    });
  });
});
