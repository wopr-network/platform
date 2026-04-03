import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock core UI components (shell re-exports from @core)
vi.mock("@core/components/ui/input", () => ({
  Input: (props: React.ComponentProps<"input">) => <input {...props} />,
}));

vi.mock("@core/components/ui/button", () => ({
  Button: ({ children, onClick, disabled, type, ...rest }: React.ComponentProps<"button">) => (
    <button type={type ?? "button"} onClick={onClick} disabled={disabled} {...rest}>
      {children}
    </button>
  ),
}));

// Mock framer-motion — render children only, no DOM prop spreading
vi.mock("framer-motion", () => ({
  motion: {
    div: (props: Record<string, unknown>) => {
      const { children } = props;
      return <div>{children as React.ReactNode}</div>;
    },
    form: (props: Record<string, unknown>) => {
      const { children, onSubmit } = props;
      return <form onSubmit={onSubmit as React.FormEventHandler}>{children as React.ReactNode}</form>;
    },
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock onboarding-chat
vi.mock("@/lib/onboarding-chat", () => ({
  sendStateMachineChat: vi.fn(),
  parseStateMachineStream: vi.fn(),
}));

// Mock api
vi.mock("@core/lib/api", () => ({
  createInstance: vi.fn(),
}));

import NewPaperclipInstancePage from "@/app/(dashboard)/instances/new/page";
import { parseStateMachineStream, sendStateMachineChat } from "@/lib/onboarding-chat";

type MockFn = ReturnType<typeof vi.fn>;

/**
 * Mock a state machine stream response. The parseStateMachineStream mock calls
 * onDelta with the visible content and returns the gate.
 */
function mockStreamResponse(
  content: string,
  gate: { ready: boolean; artifact?: Record<string, unknown> } = { ready: false },
) {
  const mockStream = new ReadableStream();
  (sendStateMachineChat as MockFn).mockReturnValue({
    abort: new AbortController(),
    response: Promise.resolve(mockStream),
  });
  (parseStateMachineStream as MockFn).mockImplementation(
    async (_body: unknown, callbacks: { onDelta: (s: string) => void; onThinking?: (b: boolean) => void }) => {
      callbacks.onThinking?.(false);
      callbacks.onDelta(content);
      return { visibleContent: content, gate };
    },
  );
}

describe("NewPaperclipInstancePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom doesn't implement scrollTo — polyfill to avoid errors
    window.HTMLElement.prototype.scrollTo = vi.fn();
  });

  it("auto-fires VISION entry prompt on mount", async () => {
    mockStreamResponse("Hey founder! What do you want to build?");

    render(<NewPaperclipInstancePage />);

    await waitFor(() => {
      expect(sendStateMachineChat).toHaveBeenCalledWith([], "VISION", "entry", {});
    });

    await waitFor(() => {
      expect(screen.getByText("Hey founder! What do you want to build?")).toBeInTheDocument();
    });
  });

  it("sends user message as VISION continue prompt", async () => {
    const user = userEvent.setup();
    // First call: entry prompt
    mockStreamResponse("What do you want to build?");

    render(<NewPaperclipInstancePage />);

    // Wait for entry prompt to complete and input to appear
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Describe what you want to build...")).toBeInTheDocument();
    });

    // Now mock the continue response
    mockStreamResponse("Great idea! Tell me more.", { ready: false });

    const input = screen.getByPlaceholderText("Describe what you want to build...");
    await user.type(input, "Build a todo app");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(screen.getByText("Build a todo app")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText("Great idea! Tell me more.")).toBeInTheDocument();
    });
  });

  it("shows error when stream fails", async () => {
    const user = userEvent.setup();
    // Entry prompt succeeds
    mockStreamResponse("What do you want to build?");

    render(<NewPaperclipInstancePage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Describe what you want to build...")).toBeInTheDocument();
    });

    // Now make the continue call fail
    const rejectedResponse = Promise.reject(new Error("Network error"));
    rejectedResponse.catch(() => {});
    (sendStateMachineChat as MockFn).mockReturnValue({
      abort: new AbortController(),
      response: rejectedResponse,
    });

    const input = screen.getByPlaceholderText("Describe what you want to build...");
    await user.type(input, "Build something");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
      expect(screen.getByText("Dismiss")).toBeInTheDocument();
    });
  });

  it("disables chat input while streaming", async () => {
    const user = userEvent.setup();
    // Entry prompt
    mockStreamResponse("What do you want to build?");

    render(<NewPaperclipInstancePage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Describe what you want to build...")).toBeInTheDocument();
    });

    // Make parseStateMachineStream hang (never resolve)
    const mockStream = new ReadableStream();
    (sendStateMachineChat as MockFn).mockReturnValue({
      abort: new AbortController(),
      response: Promise.resolve(mockStream),
    });
    (parseStateMachineStream as MockFn).mockReturnValue(new Promise(() => {}));

    const input = screen.getByPlaceholderText("Describe what you want to build...");
    await user.type(input, "Build something");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      const updatedInput = screen.getByPlaceholderText("Describe what you want to build...");
      expect(updatedInput).toBeDisabled();
    });
  });
});
