import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/billing",
}));

vi.mock("@/lib/api", () => ({
  getInferenceMode: vi.fn().mockResolvedValue("byok"),
}));

import { ByokCallout } from "@/components/billing/byok-callout";
import { getInferenceMode } from "@/lib/api";

describe("ByokCallout", () => {
  beforeEach(() => {
    vi.mocked(getInferenceMode).mockResolvedValue("byok");
  });

  it("renders BYOK callout when mode is byok", async () => {
    render(<ByokCallout />);
    expect(await screen.findByText("Bring Your Own Keys")).toBeInTheDocument();
    expect(screen.getByText(/Platform never touches your inference/)).toBeInTheDocument();
  });

  it("renders compact BYOK text when compact prop is true", async () => {
    render(<ByokCallout compact />);
    expect(await screen.findByText(/All plans are BYOK/)).toBeInTheDocument();
    expect(screen.queryByText("Bring Your Own Keys")).not.toBeInTheDocument();
  });

  it("renders hosted callout when mode is hosted", async () => {
    vi.mocked(getInferenceMode).mockResolvedValue("hosted");
    render(<ByokCallout />);
    expect(await screen.findByText("Hosted AI Adapter")).toBeInTheDocument();
    expect(screen.getByText(/transparent pricing/)).toBeInTheDocument();
  });

  it("renders compact hosted text when hosted + compact", async () => {
    vi.mocked(getInferenceMode).mockResolvedValue("hosted");
    render(<ByokCallout compact />);
    expect(await screen.findByText(/Hosted adapter/)).toBeInTheDocument();
    expect(screen.queryByText("Hosted AI Adapter")).not.toBeInTheDocument();
  });

  it("falls back to BYOK when getInferenceMode rejects", async () => {
    vi.mocked(getInferenceMode).mockRejectedValue(new Error("fail"));
    render(<ByokCallout />);
    expect(await screen.findByText("Bring Your Own Keys")).toBeInTheDocument();
  });

  it("renders loading placeholder before mode resolves", () => {
    vi.mocked(getInferenceMode).mockReturnValue(
      new Promise(() => {
        /* never resolves */
      }),
    );
    const { container } = render(<ByokCallout />);
    expect(container.querySelector(".h-5")).toBeInTheDocument();
    expect(screen.queryByText("Bring Your Own Keys")).not.toBeInTheDocument();
  });

  it("renders compact loading placeholder as nbsp", () => {
    vi.mocked(getInferenceMode).mockReturnValue(
      new Promise(() => {
        /* never resolves */
      }),
    );
    const { container } = render(<ByokCallout compact />);
    const p = container.querySelector("p");
    expect(p).toBeInTheDocument();
    expect(p?.textContent).toBe("\u00a0");
  });
});
