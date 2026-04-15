import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@core/lib/brand-config", () => ({
  getBrandConfig: () => ({ domain: "nemopod.com", productName: "NemoPod" }),
  productName: () => "NemoPod",
}));

// createInstance / listInstances are the shared tRPC helpers the component
// uses. Tests control their behavior per-case via vi.mocked(listInstances).
// apiFetch is unused by the new implementation but kept to match other
// modules that pull from @core/lib/api.
const listInstancesMock = vi.fn();
const createInstanceMock = vi.fn();

vi.mock("@core/lib/api", () => ({
  apiFetch: vi.fn(),
  createInstance: (...args: unknown[]) => createInstanceMock(...args),
  listInstances: () => listInstancesMock(),
}));
vi.mock("@core/lib/errors", () => ({
  toUserMessage: (_: unknown, f: string) => f,
}));

vi.mock("@core/components/chat/chat-panel", () => ({
  ChatPanel: (props: Record<string, unknown>) =>
    React.createElement("div", {
      "data-testid": "chat-panel",
      "data-connected": String(props.isConnected),
    }),
}));

vi.mock("@/hooks/use-instance-chat", () => ({
  useInstanceChat: () => ({
    messages: [],
    isConnected: false,
    isTyping: false,
    sessionId: "test-session",
    sendMessage: vi.fn(),
    clearHistory: vi.fn(),
  }),
}));

import { NemoClawApp } from "@/components/nemoclaw-app";

function renderWith(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

// Shape returned by listInstances() — matches @core/lib/api's Instance type.
function instance(partial: { id: string; name: string; status: "running" | "stopped" | "error" | "degraded" }) {
  return {
    id: partial.id,
    name: partial.name,
    status: partial.status,
    provider: "nemoclaw",
    channels: [],
    plugins: [],
    uptime: null,
    createdAt: new Date().toISOString(),
  };
}

describe("NemoClawApp", () => {
  beforeEach(() => {
    listInstancesMock.mockReset();
    createInstanceMock.mockReset();
  });

  it("shows first-run when no instances", async () => {
    listInstancesMock.mockResolvedValue([]);
    renderWith(<NemoClawApp />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/name your first agent/i)).toBeInTheDocument();
    });
  });

  it("shows tabs when instances exist", async () => {
    listInstancesMock.mockResolvedValue([instance({ id: "1", name: "my-bot", status: "running" })]);
    renderWith(<NemoClawApp />);
    await waitFor(() => {
      expect(screen.getByText("my-bot")).toBeInTheDocument();
    });
  });

  it("shows loading state initially", () => {
    // listInstances never resolves → component stays in isLoading
    listInstancesMock.mockReturnValue(new Promise(() => {}));
    renderWith(<NemoClawApp />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("shows ChatPanel for active instance", async () => {
    listInstancesMock.mockResolvedValue([
      instance({ id: "a", name: "alpha", status: "running" }),
      instance({ id: "b", name: "beta", status: "stopped" }),
    ]);
    renderWith(<NemoClawApp />);
    await waitFor(() => {
      expect(screen.getByTestId("chat-panel")).toBeInTheDocument();
      expect(screen.getByText("alpha")).toBeInTheDocument();
      expect(screen.getByText("beta")).toBeInTheDocument();
    });
  });
});
