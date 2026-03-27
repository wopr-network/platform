import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LandingPage } from "../components/landing/landing-page";

describe("Smoke test", () => {
  it("renders the landing page with the tagline", () => {
    render(<LandingPage />);
    expect(screen.getByText("Shall we rule the universe?")).toBeInTheDocument();
  });
});
