import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const { mockApplyCoupon } = vi.hoisted(() => ({
  mockApplyCoupon: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpcVanilla: {
    billing: {
      applyCoupon: {
        mutate: (...args: unknown[]) => mockApplyCoupon(...args),
      },
    },
  },
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/billing/credits",
}));

vi.mock("better-auth/react", () => ({
  createAuthClient: () => ({
    useSession: () => ({ data: null, isPending: false, error: null }),
  }),
}));

describe("CouponInput", () => {
  it("renders idle state — shows input and Apply button, no success/error message", async () => {
    const { CouponInput } = await import("../components/billing/coupon-input");
    render(<CouponInput />);

    expect(screen.getByPlaceholderText("Coupon code")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply" })).toBeInTheDocument();
    expect(screen.queryByText(/credits will be added/)).not.toBeInTheDocument();
  });

  it("shows loading state while applying — button shows Applying... and is disabled", async () => {
    // Never resolves so we can inspect the loading state
    mockApplyCoupon.mockImplementation(
      () =>
        new Promise(() => {
          /* never resolves — keep loading state for test */
        }),
    );
    const user = userEvent.setup();
    const { CouponInput } = await import("../components/billing/coupon-input");
    render(<CouponInput />);

    const input = screen.getByPlaceholderText("Coupon code");
    await user.type(input, "SAVE20");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(screen.getByRole("button", { name: "Applying..." })).toBeDisabled();
  });

  it("shows success state after valid code — green message with credits amount visible", async () => {
    mockApplyCoupon.mockResolvedValueOnce({
      creditsGranted: 500,
      message: "Coupon applied!",
    });
    const user = userEvent.setup();
    const { CouponInput } = await import("../components/billing/coupon-input");
    render(<CouponInput />);

    const input = screen.getByPlaceholderText("Coupon code");
    await user.type(input, "VALID50");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(await screen.findByText(/\+500 credits added to your balance/)).toBeInTheDocument();
  });

  it("shows error state after invalid code — red error message with server message shown", async () => {
    mockApplyCoupon.mockRejectedValueOnce(new Error("Coupon not found"));
    const user = userEvent.setup();
    const { CouponInput } = await import("../components/billing/coupon-input");
    render(<CouponInput />);

    const input = screen.getByPlaceholderText("Coupon code");
    await user.type(input, "BADCODE");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(await screen.findByText("Coupon not found")).toBeInTheDocument();
  });

  it("clears error when input changes — typing a new code clears the error state", async () => {
    mockApplyCoupon.mockRejectedValueOnce(new Error("Invalid code"));
    const user = userEvent.setup();
    const { CouponInput } = await import("../components/billing/coupon-input");
    render(<CouponInput />);

    const input = screen.getByPlaceholderText("Coupon code");
    await user.type(input, "BAD");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await screen.findByText("Invalid code");

    await user.type(input, "X");

    expect(screen.queryByText("Invalid code")).not.toBeInTheDocument();
  });

  it("Apply button disabled when input is empty", async () => {
    const { CouponInput } = await import("../components/billing/coupon-input");
    render(<CouponInput />);

    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
  });
});
