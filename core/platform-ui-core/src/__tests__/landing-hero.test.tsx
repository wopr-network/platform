import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Hero } from "../components/landing/hero";

describe("Landing Hero", () => {
  it("renders the CTA link", () => {
    render(<Hero />);
    expect(screen.getByRole("link", { name: /get yours/i })).toBeInTheDocument();
  });

  it("shows the price", () => {
    render(<Hero />);
    expect(screen.getAllByText(/\$5\/month/).length).toBeGreaterThan(0);
  });

  it("uses terminal variant on the CTA link", () => {
    render(<Hero />);
    const link = screen.getByRole("link", { name: /get yours/i });
    expect(link).toHaveAttribute("data-variant", "terminal");
  });

  it("links to the signup page", () => {
    render(<Hero />);
    const link = screen.getByRole("link", { name: /get yours/i });
    expect(link).toHaveAttribute("href", "/signup");
  });
});
