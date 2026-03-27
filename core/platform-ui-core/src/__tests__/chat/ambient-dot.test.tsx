import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AmbientDot } from "@/components/chat/ambient-dot";

describe("AmbientDot", () => {
  it("renders button with correct aria-label", () => {
    render(<AmbientDot hasUnread={false} onClick={vi.fn()} />);
    expect(screen.getByLabelText("Open Platform chat")).toBeInTheDocument();
  });

  it("renders with chat-ambient-dot testid", () => {
    render(<AmbientDot hasUnread={false} onClick={vi.fn()} />);
    expect(screen.getByTestId("chat-ambient-dot")).toBeInTheDocument();
  });

  it("calls onClick when clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<AmbientDot hasUnread={false} onClick={onClick} />);

    await user.click(screen.getByTestId("chat-ambient-dot"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders unread pulse animation when hasUnread is true", () => {
    render(<AmbientDot hasUnread={true} onClick={vi.fn()} />);
    expect(screen.getByTestId("chat-unread-pulse")).toBeInTheDocument();
  });

  it("does not render pulse animation when hasUnread is false", () => {
    render(<AmbientDot hasUnread={false} onClick={vi.fn()} />);
    expect(screen.queryByTestId("chat-unread-pulse")).not.toBeInTheDocument();
  });
});
