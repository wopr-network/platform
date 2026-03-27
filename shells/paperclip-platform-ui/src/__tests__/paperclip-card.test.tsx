import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PaperclipCard } from "@/components/paperclip-card";

const mockInstance = {
  id: "inst-1",
  name: "my-bot",
  status: "running" as const,
  subdomain: "my-bot.runpaperclip.com",
};

describe("PaperclipCard", () => {
  it("renders instance name", () => {
    render(<PaperclipCard instance={mockInstance} />);
    expect(screen.getByText("my-bot")).toBeInTheDocument();
  });

  it("renders subdomain as a link that opens in new tab", () => {
    render(<PaperclipCard instance={mockInstance} />);
    const link = screen.getByRole("link", {
      name: /visit my-bot/i,
    });
    expect(link).toHaveAttribute("href", "https://my-bot.runpaperclip.com");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("makes the entire card surface clickable to the subdomain", () => {
    const { container } = render(<PaperclipCard instance={mockInstance} />);
    const surface = container.querySelector("span.absolute.inset-0");
    expect(surface).not.toBeNull();
  });

  it("renders RUNNING status label uppercase", () => {
    render(<PaperclipCard instance={mockInstance} />);
    expect(screen.getByText("RUNNING")).toBeInTheDocument();
  });

  it("renders STOPPED status", () => {
    render(<PaperclipCard instance={{ ...mockInstance, status: "stopped" }} />);
    expect(screen.getByText("STOPPED")).toBeInTheDocument();
  });

  it("renders ERROR status", () => {
    render(<PaperclipCard instance={{ ...mockInstance, status: "error" }} />);
    expect(screen.getByText("ERROR")).toBeInTheDocument();
  });

  it("renders PROVISIONING status with indigo styling", () => {
    const { container } = render(
      <PaperclipCard instance={{ ...mockInstance, id: "prov-1", status: "provisioning" }} />,
    );
    expect(screen.getByText("PROVISIONING")).toBeInTheDocument();
    // Status dot should have indigo color class
    const dot = container.querySelector("[aria-hidden='true']");
    expect(dot?.className).toContain("indigo");
  });

  it("disables click surface when provisioning", () => {
    const { container } = render(
      <PaperclipCard instance={{ ...mockInstance, id: "prov-1", status: "provisioning" }} />,
    );
    const surface = container.querySelector("span.absolute.inset-0");
    expect(surface).toBeNull();
  });

  it("renders settings link with instance-specific aria-label", () => {
    render(<PaperclipCard instance={mockInstance} />);
    const settingsLink = screen.getByRole("link", {
      name: /my-bot settings/i,
    });
    expect(settingsLink).toHaveAttribute("href", "/instances/inst-1");
  });

  it("applies hero variant styling when variant is hero", () => {
    const { container } = render(<PaperclipCard instance={mockInstance} variant="hero" />);
    expect(container.firstChild).toHaveClass("max-w-xl");
  });

  it("applies grid variant styling when variant is grid", () => {
    const { container } = render(<PaperclipCard instance={mockInstance} variant="grid" />);
    expect(container.firstChild).not.toHaveClass("max-w-xl");
  });
});
