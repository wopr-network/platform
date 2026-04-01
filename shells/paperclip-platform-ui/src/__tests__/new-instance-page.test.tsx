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
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock onboarding-chat
vi.mock("@/lib/onboarding-chat", () => ({
  sendOnboardingChat: vi.fn(),
  parseOnboardingStream: vi.fn(),
}));

// Mock api
vi.mock("@/lib/api", () => ({
  createInstance: vi.fn(),
}));

import NewPaperclipInstancePage from "@/app/(dashboard)/instances/new/page";
import { createInstance } from "@/lib/api";
import { parseOnboardingStream, sendOnboardingChat } from "@/lib/onboarding-chat";

type MockFn = ReturnType<typeof vi.fn>;

function mockStreamResponse(
  content: string,
  plan: { suggestedName?: string; taskTitle: string; taskDescription: string } | null = null,
) {
  const mockStream = new ReadableStream();
  (sendOnboardingChat as MockFn).mockReturnValue({
    abort: new AbortController(),
    response: Promise.resolve(mockStream),
  });
  (parseOnboardingStream as MockFn).mockImplementation(
    async (_body: unknown, callbacks: { onDelta: (s: string) => void }) => {
      callbacks.onDelta(content);
      return { content, plan };
    },
  );
}

describe("NewPaperclipInstancePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom doesn't implement scrollTo — polyfill to avoid errors
    window.HTMLElement.prototype.scrollTo = vi.fn();
  });

  it("renders CEO intro message on load", () => {
    render(<NewPaperclipInstancePage />);
    expect(screen.getByText(/Tell me what you want to build/)).toBeInTheDocument();
    expect(screen.getByText("CEO Agent")).toBeInTheDocument();
  });

  it("sends user message and displays response", async () => {
    const user = userEvent.setup();
    mockStreamResponse("Great idea! Let me think about that.");

    render(<NewPaperclipInstancePage />);

    const input = screen.getByPlaceholderText("Describe what you want to build...");
    await user.type(input, "Build a todo app");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(screen.getByText("Build a todo app")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText("Great idea! Let me think about that.")).toBeInTheDocument();
    });

    expect(sendOnboardingChat).toHaveBeenCalledWith([{ role: "user", content: "Build a todo app" }]);
  });

  it("shows founding brief card and company name input after plan", async () => {
    const user = userEvent.setup();
    mockStreamResponse("Here is the plan.", {
      taskTitle: "Build a todo CLI",
      taskDescription: "A command-line todo manager...",
    });

    render(<NewPaperclipInstancePage />);

    const input = screen.getByPlaceholderText("Describe what you want to build...");
    await user.type(input, "Build a todo app");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(screen.getByText("Founding Brief")).toBeInTheDocument();
      expect(screen.getByText("Build a todo CLI")).toBeInTheDocument();
      expect(screen.getByText("A command-line todo manager...")).toBeInTheDocument();
    });

    // Company name input should appear
    await waitFor(() => {
      expect(screen.getByPlaceholderText("company-name")).toBeInTheDocument();
      expect(screen.getByText("Found Company")).toBeInTheDocument();
    });
  });

  it("validates company name format", async () => {
    const user = userEvent.setup();
    mockStreamResponse("Plan ready.", {
      taskTitle: "Build it",
      taskDescription: "Details...",
    });

    render(<NewPaperclipInstancePage />);

    const chatInput = screen.getByPlaceholderText("Describe what you want to build...");
    await user.type(chatInput, "Build something");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(screen.getByPlaceholderText("company-name")).toBeInTheDocument();
    });

    const nameInput = screen.getByPlaceholderText("company-name");
    await user.type(nameInput, "INVALID NAME!");

    expect(screen.getByText(/Lowercase letters, numbers, and hyphens only/)).toBeInTheDocument();
  });

  it("shows domain preview for valid company name", async () => {
    const user = userEvent.setup();
    mockStreamResponse("Let's go.", {
      taskTitle: "Build it",
      taskDescription: "Full plan...",
    });

    render(<NewPaperclipInstancePage />);

    const chatInput = screen.getByPlaceholderText("Describe what you want to build...");
    await user.type(chatInput, "Build a CLI");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(screen.getByPlaceholderText("company-name")).toBeInTheDocument();
    });

    const nameInput = screen.getByPlaceholderText("company-name");
    await user.type(nameInput, "dotsync");

    await waitFor(() => {
      expect(screen.getByText("dotsync.runpaperclip.com")).toBeInTheDocument();
    });
  });

  it("calls createInstance and redirects on Found Company", async () => {
    const user = userEvent.setup();
    mockStreamResponse("Let's go.", {
      taskTitle: "Build it",
      taskDescription: "Full plan...",
    });
    (createInstance as MockFn).mockResolvedValue({});

    // Mock window.location
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      value: { ...originalLocation, href: "" },
      writable: true,
      configurable: true,
    });

    render(<NewPaperclipInstancePage />);

    const chatInput = screen.getByPlaceholderText("Describe what you want to build...");
    await user.type(chatInput, "Build a CLI tool");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(screen.getByPlaceholderText("company-name")).toBeInTheDocument();
    });

    const nameInput = screen.getByPlaceholderText("company-name");
    await user.type(nameInput, "dotsync");
    await user.click(screen.getByText("Found Company"));

    await waitFor(() => {
      expect(createInstance).toHaveBeenCalledWith({
        name: "dotsync",
        provider: "opencode",
        channels: [],
        plugins: [],
        extra: {
          onboarding: {
            goal: "Build a CLI tool",
            taskTitle: "Build it",
            taskDescription: "Full plan...",
          },
        },
      });
    });

    expect(window.location.href).toBe("https://dotsync.runpaperclip.com");

    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });

  it("disables chat input while streaming", async () => {
    const user = userEvent.setup();

    // Make parseOnboardingStream hang (never resolve)
    const mockStream = new ReadableStream();
    (sendOnboardingChat as MockFn).mockReturnValue({
      abort: new AbortController(),
      response: Promise.resolve(mockStream),
    });
    (parseOnboardingStream as MockFn).mockReturnValue(new Promise(() => {}));

    render(<NewPaperclipInstancePage />);

    const input = screen.getByPlaceholderText("Describe what you want to build...");
    await user.type(input, "Build something");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      const updatedInput = screen.getByPlaceholderText("Describe what you want to build...");
      expect(updatedInput).toBeDisabled();
    });
  });

  it("shows error when stream fails", async () => {
    const user = userEvent.setup();
    const rejectedResponse = Promise.reject(new Error("Network error"));
    // Attach a catch so the rejection is not unhandled at the Promise level
    rejectedResponse.catch(() => {});
    (sendOnboardingChat as MockFn).mockReturnValue({
      abort: new AbortController(),
      response: rejectedResponse,
    });

    render(<NewPaperclipInstancePage />);

    const input = screen.getByPlaceholderText("Describe what you want to build...");
    await user.type(input, "Build something");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
      expect(screen.getByText("Dismiss")).toBeInTheDocument();
    });
  });
});
