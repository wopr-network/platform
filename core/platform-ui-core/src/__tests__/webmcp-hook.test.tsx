import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWebMCP } from "../hooks/use-webmcp";

const mockRegisterWebMCPTools = vi.fn();

vi.mock("@/lib/webmcp/register", () => ({
  registerWebMCPTools: (...args: unknown[]) => mockRegisterWebMCPTools(...args),
}));

const mockUseSession = vi.fn();

vi.mock("@/lib/auth-client", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function TestComponent() {
  useWebMCP();
  return null;
}

describe("useWebMCP", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRegisterWebMCPTools.mockReturnValue(false);
  });

  it("does not register when session is null", () => {
    mockUseSession.mockReturnValue({ data: null });

    render(<TestComponent />);

    expect(mockRegisterWebMCPTools).toHaveBeenCalledWith(
      false,
      expect.any(Function),
      expect.objectContaining({ router: expect.any(Object) }),
    );
  });

  it("registers tools when session has a user", () => {
    mockRegisterWebMCPTools.mockReturnValue(true);
    mockUseSession.mockReturnValue({
      data: { user: { id: "user-1", name: "Test User", email: "test@example.com" } },
    });

    render(<TestComponent />);

    expect(mockRegisterWebMCPTools).toHaveBeenCalledWith(
      true,
      expect.any(Function),
      expect.objectContaining({ router: expect.any(Object) }),
    );
  });

  it("only registers once even if re-rendered", () => {
    mockRegisterWebMCPTools.mockReturnValue(true);
    mockUseSession.mockReturnValue({
      data: { user: { id: "user-1", name: "Test User", email: "test@example.com" } },
    });

    const { rerender } = render(<TestComponent />);
    rerender(<TestComponent />);
    rerender(<TestComponent />);

    // After first successful registration, the ref guard prevents re-registration
    expect(mockRegisterWebMCPTools).toHaveBeenCalledTimes(1);
  });
});
