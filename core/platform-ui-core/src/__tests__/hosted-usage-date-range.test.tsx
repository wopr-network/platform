import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Mock the API module
vi.mock("@/lib/api", () => ({
  getHostedUsageEvents: vi.fn().mockResolvedValue([]),
  apiFetch: vi.fn(),
}));

// Mock framer-motion to avoid animation issues in tests
vi.mock("framer-motion", () => ({
  motion: {
    tr: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
      <tr {...props}>{children}</tr>
    ),
  },
}));

import HostedUsageDetailPage from "@/app/(dashboard)/billing/usage/hosted/page";
import { getHostedUsageEvents } from "@/lib/api";

describe("HostedUsageDetailPage date range", () => {
  it("renders from and to date inputs", async () => {
    render(<HostedUsageDetailPage />);
    const fromInput = await screen.findByLabelText("From date");
    const toInput = screen.getByLabelText("To date");
    expect(fromInput).toBeInTheDocument();
    expect(toInput).toBeInTheDocument();
  });

  it("passes from and to params to getHostedUsageEvents on initial load", async () => {
    render(<HostedUsageDetailPage />);
    await screen.findByLabelText("From date");
    expect(getHostedUsageEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        from: expect.any(String),
        to: expect.any(String),
      }),
    );
  });

  it("re-fetches when date range changes", async () => {
    render(<HostedUsageDetailPage />);
    const fromInput = await screen.findByLabelText("From date");
    fireEvent.change(fromInput, { target: { value: "2025-01-01" } });
    await waitFor(() =>
      expect(getHostedUsageEvents).toHaveBeenLastCalledWith(
        expect.objectContaining({
          from: "2025-01-01",
        }),
      ),
    );
  });
});
