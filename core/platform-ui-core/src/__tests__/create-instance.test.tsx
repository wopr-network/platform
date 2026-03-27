import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreateInstanceClient } from "../app/instances/new/create-instance-client";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn().mockReturnValue({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: vi.fn().mockReturnValue("/instances/new"),
  useSearchParams: vi.fn().mockReturnValue(new URLSearchParams()),
}));

vi.mock("@/lib/marketplace-data", () => ({
  listMarketplacePlugins: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  createInstance: vi.fn().mockResolvedValue({
    id: "inst-new",
    name: "my-new-instance",
    template: "Custom",
    status: "stopped",
    provider: "anthropic",
    channels: [],
    plugins: [],
    uptime: null,
    createdAt: new Date().toISOString(),
  }),
}));

import { listMarketplacePlugins } from "@/lib/marketplace-data";

const mockListMarketplacePlugins = vi.mocked(listMarketplacePlugins);

beforeEach(() => {
  // Default: reject so hook falls back to static data quickly (loading resolves)
  mockListMarketplacePlugins.mockRejectedValue(new Error("no marketplace in tests"));
});

describe("CreateInstanceClient", () => {
  it("shows loading state before plugin data is ready", () => {
    // Override to never resolve so loading stays true
    const noop = (_resolve: unknown) => void _resolve;
    mockListMarketplacePlugins.mockReturnValue(new Promise(noop));
    render(<CreateInstanceClient />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("renders the create form heading", async () => {
    render(<CreateInstanceClient />);
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Create Instance" })).toBeInTheDocument(),
    );
  });

  it("renders preset cards", async () => {
    render(<CreateInstanceClient />);
    await waitFor(() => {
      expect(screen.getByText("Discord AI Bot")).toBeInTheDocument();
      expect(screen.getByText("Slack AI Assistant")).toBeInTheDocument();
      expect(screen.getByText("Multi-Channel")).toBeInTheDocument();
    });
  });

  it("disables submit button without name", async () => {
    render(<CreateInstanceClient />);
    await waitFor(() => screen.getByRole("button", { name: "Create Instance" }));
    const submitBtn = screen.getByRole("button", { name: "Create Instance" });
    expect(submitBtn).toBeDisabled();
  });

  it("enables submit button when name is entered without preset", async () => {
    const user = userEvent.setup();
    render(<CreateInstanceClient />);
    await waitFor(() => screen.getByPlaceholderText("my-instance"));
    const nameInput = screen.getByPlaceholderText("my-instance");
    await user.type(nameInput, "my-bot");
    const submitBtn = screen.getByRole("button", { name: "Create Instance" });
    expect(submitBtn).toBeEnabled();
  });

  it("shows confirmation after creating", async () => {
    const user = userEvent.setup();
    render(<CreateInstanceClient />);

    // Wait for loading to complete
    await waitFor(() => screen.getByText("Discord AI Bot"));

    // Select preset
    await user.click(screen.getByText("Discord AI Bot"));

    // Enter name
    const nameInput = screen.getByPlaceholderText("my-instance");
    await user.type(nameInput, "my-new-instance");

    // Submit
    await user.click(screen.getByRole("button", { name: "Create Instance" }));

    await waitFor(() => {
      expect(screen.getByText("Instance created")).toBeInTheDocument();
    });
  });
});
