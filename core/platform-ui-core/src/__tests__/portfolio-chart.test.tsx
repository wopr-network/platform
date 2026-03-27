import { render } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { PortfolioChart } from "../components/landing/portfolio-chart";

describe("PortfolioChart", () => {
  it("renders a canvas element", () => {
    const milestoneRef = createRef<((label: string) => void) | null>();
    const fadeStartRef = createRef<(() => void) | null>();
    const { container } = render(
      <PortfolioChart onMilestoneRef={milestoneRef} onFadeStartRef={fadeStartRef} />,
    );
    const canvas = container.querySelector("canvas");
    expect(canvas).toBeInTheDocument();
  });

  it("renders without crashing when refs are provided", () => {
    const milestoneRef = createRef<((label: string) => void) | null>();
    const fadeStartRef = createRef<(() => void) | null>();
    expect(() =>
      render(<PortfolioChart onMilestoneRef={milestoneRef} onFadeStartRef={fadeStartRef} />),
    ).not.toThrow();
  });
});
