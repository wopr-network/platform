import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import BillingLayout from "@/app/(dashboard)/billing/layout";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: () => "/billing/plans",
}));

// Mock next/link
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock API — mode never resolves (stays null)
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
  getInferenceMode: () =>
    new Promise((_resolve) => {
      /* never resolves */
    }),
}));

test("hostedOnly nav item is hidden (not just invisible) while mode is loading", () => {
  render(
    <BillingLayout>
      <div>child</div>
    </BillingLayout>,
  );

  const hostedLink = screen.getByText("Hosted Usage");
  const li = hostedLink.closest("li");
  expect(li?.className).toMatch(/\bhidden\b/);
  expect(li?.className).not.toMatch(/\binvisible\b/);
});
