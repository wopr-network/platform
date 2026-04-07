import { render, screen } from "@testing-library/react";
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

  it("renders a fallback icon for tenants without images", () => {
    render(<AccountSwitcher />);
    // The component renders a span with bg-sidebar-accent class as the fallback icon
    const icon = document.querySelector(".bg-sidebar-accent");
    expect(icon).not.toBeNull();
  });

  it("renders nothing when no tenants exist", () => {
    mockUseTenant.mockReturnValue({
      activeTenantId: "",
      tenants: [],
      isLoading: false,
      switchTenant: mockSwitchTenant,
    });

    const { container } = render(<AccountSwitcher />);
    expect(container.firstChild).toBeNull();
  });

  it("falls back to first tenant when activeTenantId does not match", () => {
    mockUseTenant.mockReturnValue({
      activeTenantId: "nonexistent",
      tenants: [
        { id: "user-1", name: "Alice", type: "personal" as const, image: null },
        { id: "org-1", name: "My Team", type: "org" as const, image: null },
      ],
      isLoading: false,
      switchTenant: mockSwitchTenant,
    });

    render(<AccountSwitcher />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
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
