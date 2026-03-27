import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SuperpowerContent } from "@/components/marketplace/superpower-content";

describe("SuperpowerContent sanitization", () => {
  it("strips javascript: links from markdown", () => {
    const malicious = '[Click me](javascript:alert("xss"))';
    const { container } = render(<SuperpowerContent markdown={malicious} />);
    const link = container.querySelector("a");
    // rehype-sanitize should either remove the href or remove the link entirely
    if (link) {
      const href = link.getAttribute("href");
      expect(href === null || !href.includes("javascript:")).toBe(true);
    }
    // The text content should still render
    expect(screen.getByText("Click me")).toBeInTheDocument();
  });

  it("strips inline event handlers from raw HTML in markdown", () => {
    const malicious = '<img src="x" onerror="alert(1)">';
    const { container } = render(<SuperpowerContent markdown={malicious} />);
    const img = container.querySelector("img");
    if (img) {
      expect(img.getAttribute("onerror")).toBeNull();
    }
  });

  it("strips script tags from markdown", () => {
    const malicious = '<script>alert("xss")</script>';
    const { container } = render(<SuperpowerContent markdown={malicious} />);
    expect(container.querySelector("script")).toBeNull();
    expect(container.innerHTML).not.toContain("<script");
  });

  it("renders legitimate markdown correctly", () => {
    const legitimate = [
      "# Welcome",
      "",
      "A paragraph with **bold** and *italic* text.",
      "",
      "- Item one",
      "- Item two",
      "",
      "[Safe link](https://example.com)",
      "",
      "```js",
      'console.log("hello");',
      "```",
    ].join("\n");

    const { container } = render(<SuperpowerContent markdown={legitimate} />);

    // H1 renders (via custom component)
    expect(screen.getByText("Welcome")).toBeInTheDocument();
    // Bold text renders
    expect(container.querySelector("strong")).toBeInTheDocument();
    // Link has correct href
    const link = container.querySelector("a");
    expect(link).toBeInTheDocument();
    expect(link?.getAttribute("href")).toBe("https://example.com");
    // Code block renders
    expect(container.querySelector("code")).toBeInTheDocument();
  });

  it("renders section headings and collapsible content", () => {
    const withSections = [
      "# Title",
      "",
      "Preamble text.",
      "",
      "## Features",
      "",
      "Some features here.",
      "",
      "## What Gets Installed",
      "",
      "Details that should be collapsed.",
    ].join("\n");

    const { container } = render(<SuperpowerContent markdown={withSections} />);

    expect(screen.getByText("Features")).toBeInTheDocument();
    expect(screen.getByText("What Gets Installed")).toBeInTheDocument();
    // "What Gets Installed" should be in a <details> (collapsed)
    expect(container.querySelector("details")).toBeInTheDocument();
  });
});
