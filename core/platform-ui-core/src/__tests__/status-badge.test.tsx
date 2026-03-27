import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "../components/status-badge";

describe("StatusBadge", () => {
  it("renders Running status with green styling", () => {
    render(<StatusBadge status="running" />);
    const badge = screen.getByText("Running");
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain("text-emerald-500");
  });

  it("renders Stopped status with gray styling", () => {
    render(<StatusBadge status="stopped" />);
    const badge = screen.getByText("Stopped");
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain("text-zinc-400");
  });

  it("renders Degraded status with yellow styling", () => {
    render(<StatusBadge status="degraded" />);
    const badge = screen.getByText("Degraded");
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain("text-yellow-500");
  });

  it("renders Error status with red styling", () => {
    render(<StatusBadge status="error" />);
    const badge = screen.getByText("Error");
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain("text-red-500");
  });
});
