import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { pricingData } from "../lib/pricing-data";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    fetchPublicPricing: vi.fn().mockResolvedValue(null),
    fetchDividendStats: vi.fn().mockResolvedValue(null),
  };
});

async function renderAsync(component: Promise<React.ReactElement> | React.ReactElement) {
  const resolved = await component;
  return render(resolved);
}

describe("PricingPage", () => {
  it("renders the dividend hero headline", async () => {
    const { PricingPage } = await import("../components/pricing/pricing-page");
    await renderAsync(PricingPage());
    expect(screen.getByText(/Platform pays for itself/i)).toBeInTheDocument();
  });

  it("shows the community dividend badge", async () => {
    const { PricingPage } = await import("../components/pricing/pricing-page");
    await renderAsync(PricingPage());
    const badge = screen.getByText("Community dividend");
    expect(badge).toHaveAttribute("data-variant", "terminal");
  });

  it("shows the bot price as pool eligibility ($5/month)", async () => {
    const { PricingPage } = await import("../components/pricing/pricing-page");
    await renderAsync(PricingPage());
    const priceEl = screen.getByTestId("bot-price");
    expect(priceEl).toHaveTextContent("$5");
    expect(priceEl).toHaveTextContent("/month");
  });

  it("shows all capability categories from static fallback", async () => {
    const { PricingPage } = await import("../components/pricing/pricing-page");
    await renderAsync(PricingPage());
    for (const capability of pricingData.capabilities) {
      expect(screen.getByText(capability.category)).toBeInTheDocument();
    }
  });

  it("shows model names from static fallback", async () => {
    const { PricingPage } = await import("../components/pricing/pricing-page");
    await renderAsync(PricingPage());
    for (const capability of pricingData.capabilities) {
      for (const model of capability.models) {
        expect(screen.getByText(model.name)).toBeInTheDocument();
      }
    }
  });

  it("has a CTA link to /signup", async () => {
    const { PricingPage } = await import("../components/pricing/pricing-page");
    await renderAsync(PricingPage());
    const ctas = screen.getAllByRole("link", { name: /get started/i });
    expect(ctas.length).toBeGreaterThanOrEqual(1);
    expect(ctas[0]).toHaveAttribute("href", "/signup");
  });

  it("shows the signup credit amount", async () => {
    const { PricingPage } = await import("../components/pricing/pricing-page");
    await renderAsync(PricingPage());
    expect(screen.getByText(/\$5 signup credit/)).toBeInTheDocument();
  });

  it("renders the DividendStats section", async () => {
    const { PricingPage } = await import("../components/pricing/pricing-page");
    await renderAsync(PricingPage());
    expect(screen.getByTestId("pool-amount")).toBeInTheDocument();
    expect(screen.getByTestId("active-users")).toBeInTheDocument();
    expect(screen.getByTestId("projected-dividend")).toBeInTheDocument();
  });

  it("renders the DividendCalculator section", async () => {
    const { PricingPage } = await import("../components/pricing/pricing-page");
    await renderAsync(PricingPage());
    expect(screen.getByText(/100K active users/i)).toBeInTheDocument();
    expect(screen.getByTestId("net-cost")).toBeInTheDocument();
  });

  it("frames bot price as pool eligibility", async () => {
    const { PricingPage } = await import("../components/pricing/pricing-page");
    await renderAsync(PricingPage());
    expect(screen.getByText(/minimum spend to stay in the dividend pool/i)).toBeInTheDocument();
  });

  it("renders with live API data when available", async () => {
    const { fetchPublicPricing } = await import("@/lib/api");
    (fetchPublicPricing as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      rates: {
        llm: [{ name: "Test LLM Model", unit: "1M tokens", price: 5.0 }],
      },
    });

    const { PricingPage } = await import("../components/pricing/pricing-page");
    await renderAsync(PricingPage());
    expect(screen.getByText("Test LLM Model")).toBeInTheDocument();
    expect(screen.getByText("Text Generation")).toBeInTheDocument();
  });
});
