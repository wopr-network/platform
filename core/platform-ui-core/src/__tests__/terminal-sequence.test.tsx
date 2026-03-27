import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TerminalSequence } from "../components/landing/terminal-sequence";

describe("TerminalSequence", () => {
  it("renders the terminal container with accessible role", () => {
    render(<TerminalSequence />);
    expect(screen.getByRole("img")).toBeInTheDocument();
  });

  it("has an accessible aria-label", () => {
    render(<TerminalSequence />);
    const container = screen.getByRole("img");
    expect(container).toHaveAttribute("aria-label", expect.stringContaining("Terminal animation"));
  });

  it("renders hold lines in reduced-motion mode", () => {
    render(<TerminalSequence />);
    expect(screen.getByText("Platform.")).toBeInTheDocument();
    expect(screen.getByText(/Ready to launch/)).toBeInTheDocument();
  });

  it("calls onComplete in reduced-motion mode", () => {
    const onComplete = vi.fn();
    render(<TerminalSequence onComplete={onComplete} />);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
