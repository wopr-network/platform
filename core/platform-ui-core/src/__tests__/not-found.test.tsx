import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DashboardNotFound from "@/app/(dashboard)/not-found";

describe("DashboardNotFound", () => {
  it("renders the 404 error code", () => {
    render(<DashboardNotFound />);
    expect(screen.getByText("404")).toBeInTheDocument();
  });

  it("renders the error message", () => {
    render(<DashboardNotFound />);
    expect(screen.getByText(/route not found/i)).toBeInTheDocument();
  });

  it("renders a link to the dashboard", () => {
    render(<DashboardNotFound />);
    const links = screen.getAllByRole("link");
    expect(links.some((link) => link.getAttribute("href") === "/dashboard")).toBe(true);
  });

  it("renders the terminal icon and system error label", () => {
    render(<DashboardNotFound />);
    expect(screen.getByText(/system error/i)).toBeInTheDocument();
  });
});
