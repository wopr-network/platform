import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StorySections } from "../components/landing/story-sections";

describe("StorySections", () => {
  it("renders all three story headings", () => {
    render(<StorySections />);
    expect(screen.getByText("It works while you sleep.")).toBeInTheDocument();
    expect(screen.getByText("It doesn't quit when you do.")).toBeInTheDocument();
    expect(screen.getByText("It runs the whole thing.")).toBeInTheDocument();
  });

  it("renders story body text", () => {
    render(<StorySections />);
    expect(screen.getByText(/Regina went to bed/)).toBeInTheDocument();
    expect(screen.getByText(/Alvin said/)).toBeInTheDocument();
    expect(screen.getByText(/T hasn't hired anyone/)).toBeInTheDocument();
  });

  it("wraps content in a section element", () => {
    const { container } = render(<StorySections />);
    expect(container.querySelector("section")).toBeInTheDocument();
  });
});
