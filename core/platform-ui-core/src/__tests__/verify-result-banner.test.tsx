import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

let mockSearchParams = new URLSearchParams();
const mockReplace = vi.fn();
const mockPathname = "/";

vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => mockPathname,
}));

import { EmailVerificationResultBanner } from "@/components/auth/email-verification-result-banner";

describe("EmailVerificationResultBanner", () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
    mockReplace.mockClear();
  });

  it("renders nothing when no status param", () => {
    const { container } = render(<EmailVerificationResultBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("renders success banner with credit message", () => {
    mockSearchParams = new URLSearchParams("status=success");
    render(<EmailVerificationResultBanner />);

    expect(screen.getByText(/verified/i)).toBeInTheDocument();
    expect(screen.getByText(/\$5\.00/)).toBeInTheDocument();
  });

  it("renders error banner for error status", () => {
    mockSearchParams = new URLSearchParams("status=error");
    render(<EmailVerificationResultBanner />);

    expect(screen.getByText(/failed/i)).toBeInTheDocument();
  });

  it("renders create bot CTA on success", () => {
    mockSearchParams = new URLSearchParams("status=success");
    render(<EmailVerificationResultBanner />);

    expect(screen.getByRole("link", { name: /create.*bot/i })).toHaveAttribute("href", "/fleet");
  });

  it("cleans URL params after mount", () => {
    mockSearchParams = new URLSearchParams("status=success");
    render(<EmailVerificationResultBanner />);

    expect(mockReplace).toHaveBeenCalledWith("/", { scroll: false });
  });

  it("dismisses when close button clicked", async () => {
    mockSearchParams = new URLSearchParams("status=success");
    render(<EmailVerificationResultBanner />);

    const dismissBtn = screen.getByRole("button", { name: /dismiss/i });
    await userEvent.click(dismissBtn);

    expect(screen.queryByText(/verified/i)).not.toBeInTheDocument();
  });
});
