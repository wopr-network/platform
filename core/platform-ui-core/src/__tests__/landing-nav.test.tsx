import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LandingNav } from "../components/landing/landing-nav";

describe("LandingNav", () => {
  it("renders the brand link", () => {
    render(<LandingNav />);
    const link = screen.getByRole("link", { name: /platform/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/");
  });

  it("renders the sign-in link", () => {
    render(<LandingNav />);
    const link = screen.getByRole("link", { name: /sign in/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/login");
  });

  it("renders as a nav element", () => {
    render(<LandingNav />);
    expect(screen.getByRole("navigation")).toBeInTheDocument();
  });
});
