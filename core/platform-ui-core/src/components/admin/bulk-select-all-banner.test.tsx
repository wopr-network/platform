import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BulkSelectAllBanner } from "./bulk-select-all-banner";

const defaultProps = {
  visible: true,
  pageCount: 25,
  totalMatching: 142,
  onSelectAllMatching: vi.fn(),
};

describe("BulkSelectAllBanner", () => {
  it("renders page count message when visible", () => {
    render(<BulkSelectAllBanner {...defaultProps} />);
    expect(screen.getByText(/All 25 users on this page are selected/)).toBeInTheDocument();
  });

  it("renders select all matching button with total count", () => {
    render(<BulkSelectAllBanner {...defaultProps} />);
    expect(screen.getByText(/Select all 142 matching filters/)).toBeInTheDocument();
  });

  it("renders nothing when not visible", () => {
    const { container } = render(<BulkSelectAllBanner {...defaultProps} visible={false} />);
    expect(container.textContent).toBe("");
  });

  it("fires onSelectAllMatching when link button clicked", async () => {
    const user = userEvent.setup();
    const onSelectAllMatching = vi.fn();
    render(<BulkSelectAllBanner {...defaultProps} onSelectAllMatching={onSelectAllMatching} />);
    await user.click(screen.getByText(/Select all 142 matching filters/));
    expect(onSelectAllMatching).toHaveBeenCalledOnce();
  });
});
