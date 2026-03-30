import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Hero } from "../src/components/landing/hero";
import { LandingFooter } from "../src/components/landing/footer";
import { Recognition } from "../src/components/landing/recognition";

describe("Hero", () => {
  it("renders the brand name", () => {
    render(<Hero />);
    expect(screen.getAllByText(/Holy Ship/).length).toBeGreaterThan(0);
  });

  it("renders the CTA", () => {
    render(<Hero />);
    const cta = screen.getByRole("link", { name: /Get Started/i });
    expect(cta).toBeDefined();
  });

  it("renders the how it works link", () => {
    render(<Hero />);
    const link = screen.getByRole("link", { name: /how it works/i });
    expect(link).toBeDefined();
  });
});

describe("Recognition", () => {
  it("renders the heading", () => {
    render(<Recognition />);
    expect(screen.getByText(/You already know/)).toBeDefined();
  });

  it("renders the homework line", () => {
    render(<Recognition />);
    expect(screen.getByText(/grade its own homework/)).toBeDefined();
  });

  it("renders the funny name section", () => {
    render(<Recognition />);
    expect(screen.getByText(/We named it Holy Ship/)).toBeDefined();
  });
});

describe("LandingFooter", () => {
  it("renders how it works link", () => {
    render(<LandingFooter />);
    expect(screen.getByRole("link", { name: /how it works/i })).toBeDefined();
  });

  it("renders github link", () => {
    render(<LandingFooter />);
    expect(screen.getByRole("link", { name: /github/i })).toBeDefined();
  });

  it("renders the real cost link", () => {
    render(<LandingFooter />);
    expect(screen.getByRole("link", { name: /the real cost/i })).toBeDefined();
  });
});
