import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSwitchTenant = vi.fn();
const mockUseTenant = vi.fn(() => ({
  activeTenantId: "user-1",
  tenants: [
    { id: "user-1", name: "Alice", type: "personal" as const, image: null },
    { id: "org-1", name: "My Team", type: "org" as const, image: null },
  ],
  isLoading: false,
  switchTenant: mockSwitchTenant,
}));

vi.mock("@/lib/tenant-context", () => ({
  useTenant: () => mockUseTenant(),
}));

import { AccountSwitcher } from "@/components/account-switcher";

describe("AccountSwitcher", () => {
  beforeEach(() => {
    mockSwitchTenant.mockClear();
    mockUseTenant.mockClear();
    mockUseTenant.mockReturnValue({
      activeTenantId: "user-1",
      tenants: [
        { id: "user-1", name: "Alice", type: "personal" as const, image: null },
        { id: "org-1", name: "My Team", type: "org" as const, image: null },
      ],
      isLoading: false,
      switchTenant: mockSwitchTenant,
    });
  });

  it("renders the active tenant name", () => {
    render(<AccountSwitcher />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("shows PERSONAL badge for personal account", () => {
    render(<AccountSwitcher />);
    expect(screen.getByText("PERSONAL")).toBeInTheDocument();
  });

  it("shows all tenants when clicked", async () => {
    const user = userEvent.setup();
    render(<AccountSwitcher />);
    await user.click(screen.getByRole("button"));
    expect(screen.getByText("My Team")).toBeInTheDocument();
  });

  it("calls switchTenant when an org is selected", async () => {
    const user = userEvent.setup();
    render(<AccountSwitcher />);
    await user.click(screen.getByRole("button"));
    await user.click(screen.getByText("My Team"));
    expect(mockSwitchTenant).toHaveBeenCalledWith("org-1");
  });

  it("renders nothing when only one tenant exists", () => {
    mockUseTenant.mockReturnValue({
      activeTenantId: "user-1",
      tenants: [{ id: "user-1", name: "Alice", type: "personal" as const, image: null }],
      isLoading: false,
      switchTenant: mockSwitchTenant,
    });

    const { container } = render(<AccountSwitcher />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing while loading", () => {
    mockUseTenant.mockReturnValue({
      activeTenantId: "",
      tenants: [],
      isLoading: true,
      switchTenant: mockSwitchTenant,
    });

    const { container } = render(<AccountSwitcher />);
    expect(container.firstChild).toBeNull();
  });
});
