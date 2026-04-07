import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import BillingLayout from "@/app/(dashboard)/billing/layout";

test("billing layout renders children and footer links", () => {
  render(
    <BillingLayout>
      <div>child</div>
    </BillingLayout>,
  );

  expect(screen.getByText("child")).toBeInTheDocument();
  expect(screen.getByText("Terms of Service")).toBeInTheDocument();
  expect(screen.getByText("Privacy Policy")).toBeInTheDocument();
});
