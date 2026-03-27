import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Instance } from "@/lib/api";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/dashboard/network",
}));

vi.mock("better-auth/react", () => ({
  createAuthClient: () => ({
    useSession: () => ({ data: null, isPending: false, error: null }),
    signIn: { email: vi.fn(), social: vi.fn() },
    signUp: { email: vi.fn() },
    signOut: vi.fn(),
  }),
}));

const MOCK_INSTANCES: Instance[] = [
  {
    id: "inst-1",
    name: "Alpha Bot",
    status: "running",
    channels: [],
    createdAt: new Date().toISOString(),
    provider: "",
    plugins: [],
    uptime: null,
  },
  {
    id: "inst-2",
    name: "Beta Bot",
    status: "stopped",
    channels: [],
    createdAt: new Date().toISOString(),
    provider: "",
    plugins: [],
    uptime: null,
  },
];

vi.mock("@/components/instances/friends-tab", () => ({
  FriendsTab: ({ instanceId }: { instanceId: string }) => (
    <div data-testid="friends-tab" data-instance-id={instanceId} />
  ),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    listInstances: vi.fn(),
  };
});

import NetworkPage from "@/app/(dashboard)/dashboard/network/page";
import { listInstances } from "@/lib/api";

describe("NetworkPage", () => {
  it("renders page heading", async () => {
    vi.mocked(listInstances).mockResolvedValue(MOCK_INSTANCES);
    render(<NetworkPage />);
    expect(screen.getByText(/friends/i)).toBeInTheDocument();
  });

  it("shows instance selector after load", async () => {
    vi.mocked(listInstances).mockResolvedValue(MOCK_INSTANCES);
    render(<NetworkPage />);
    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: /select instance/i })).toBeInTheDocument();
    });
  });

  it("shows placeholder when no instance is selected", async () => {
    vi.mocked(listInstances).mockResolvedValue(MOCK_INSTANCES);
    render(<NetworkPage />);
    await waitFor(() => {
      expect(screen.getByText(/select an instance to manage friends/i)).toBeInTheDocument();
    });
  });

  it("auto-selects the only instance when there is one", async () => {
    vi.mocked(listInstances).mockResolvedValue([MOCK_INSTANCES[0]]);
    render(<NetworkPage />);
    // When single instance is auto-selected, FriendsTab mounts and triggers its own API calls.
    // We just confirm the placeholder is NOT shown.
    await waitFor(() => {
      expect(screen.queryByText(/select an instance to manage friends/i)).toBeNull();
    });
  });

  it("shows error message when listInstances fails", async () => {
    vi.mocked(listInstances).mockRejectedValue(new Error("network error"));
    render(<NetworkPage />);
    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
  });
});
