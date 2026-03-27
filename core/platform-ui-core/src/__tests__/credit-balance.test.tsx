import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreditBalance } from "@/components/billing/credit-balance";

describe("CreditBalance", () => {
  beforeEach(() => {
    // Make requestAnimationFrame fire synchronously so the count-up animation completes instantly
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(performance.now() + 2000); // advance time past animation duration
      return 0;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the formatted balance", async () => {
    render(<CreditBalance data={{ balance: 42.5, dailyBurn: 3.25, runway: 13 }} />);
    // The count-up animation targets 42.5 → "$42.50"
    await waitFor(() => {
      expect(screen.getByText("$42.50")).toBeInTheDocument();
    });
  });

  it("renders daily burn rate", () => {
    render(<CreditBalance data={{ balance: 100, dailyBurn: 5.0, runway: 20 }} />);
    expect(screen.getByText("$5.00/day")).toBeInTheDocument();
  });

  it("renders runway in days (plural)", () => {
    render(<CreditBalance data={{ balance: 100, dailyBurn: 5.0, runway: 20 }} />);
    expect(screen.getByText("~20 days")).toBeInTheDocument();
  });

  it("renders runway singular for 1 day", () => {
    render(<CreditBalance data={{ balance: 5, dailyBurn: 5.0, runway: 1 }} />);
    expect(screen.getByText("~1 day")).toBeInTheDocument();
  });

  it("renders 'Suspended' when runway is 0", () => {
    render(<CreditBalance data={{ balance: 0, dailyBurn: 5.0, runway: 0 }} />);
    expect(screen.getByText("Suspended")).toBeInTheDocument();
  });

  it("renders 'N/A' when runway is null", () => {
    render(<CreditBalance data={{ balance: 50, dailyBurn: 0, runway: null }} />);
    expect(screen.getByText("N/A")).toBeInTheDocument();
  });

  it("applies destructive color when balance <= 2", async () => {
    const { container } = render(
      <CreditBalance data={{ balance: 1.5, dailyBurn: 1.5, runway: 1 }} />,
    );
    await waitFor(() => {
      const balanceEl = container.querySelector(".text-4xl");
      expect(balanceEl?.className).toContain("text-destructive");
    });
  });

  it("applies destructive color when runway <= 1", async () => {
    const { container } = render(
      <CreditBalance data={{ balance: 50, dailyBurn: 50, runway: 1 }} />,
    );
    await waitFor(() => {
      const balanceEl = container.querySelector(".text-4xl");
      expect(balanceEl?.className).toContain("text-destructive");
    });
  });

  it("applies amber color when balance <= 10", async () => {
    const { container } = render(<CreditBalance data={{ balance: 8, dailyBurn: 2, runway: 4 }} />);
    await waitFor(() => {
      const balanceEl = container.querySelector(".text-4xl");
      expect(balanceEl?.className).toContain("text-amber-500");
    });
  });

  it("applies amber color when runway <= 7", async () => {
    const { container } = render(
      <CreditBalance data={{ balance: 50, dailyBurn: 10, runway: 5 }} />,
    );
    await waitFor(() => {
      const balanceEl = container.querySelector(".text-4xl");
      expect(balanceEl?.className).toContain("text-amber-500");
    });
  });

  it("applies emerald color for healthy balance", async () => {
    const { container } = render(
      <CreditBalance data={{ balance: 100, dailyBurn: 5, runway: 20 }} />,
    );
    await waitFor(() => {
      const balanceEl = container.querySelector(".text-4xl");
      expect(balanceEl?.className).toContain("text-emerald-500");
    });
  });

  it("renders the card title", () => {
    render(<CreditBalance data={{ balance: 50, dailyBurn: 2, runway: 25 }} />);
    expect(screen.getByText("Credit Balance")).toBeInTheDocument();
  });
});
