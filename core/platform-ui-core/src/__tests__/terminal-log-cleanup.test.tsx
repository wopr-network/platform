import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TerminalLog } from "@/app/(dashboard)/marketplace/[plugin]/page";

const fakePlugin = {
  id: "test-plugin",
  name: "Test Plugin",
  version: "1.0.0",
  requires: [],
  capabilities: ["test"],
  description: "",
  author: "",
  category: "utility" as const,
  icon: "",
  installed: false,
  installCount: 0,
  rating: 5,
  color: "#000000",
  setup: [],
  configSchema: [],
  changelog: [],
};

describe("TerminalLog cleanup", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("should clear the onDone timeout on unmount", () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    const onDone = vi.fn();

    // biome-ignore lint/suspicious/noExplicitAny: test only
    const { unmount } = render(<TerminalLog plugin={fakePlugin as any} onDone={onDone} />);

    // Advance past all interval ticks + into the setTimeout territory
    vi.advanceTimersByTime(10000);

    const callsBefore = clearTimeoutSpy.mock.calls.length;
    unmount();

    // clearTimeout should be called at least once more on unmount (for the done timeout)
    expect(clearTimeoutSpy.mock.calls.length).toBeGreaterThan(callsBefore);
    clearTimeoutSpy.mockRestore();
  });
});
