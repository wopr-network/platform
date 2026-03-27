import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FieldOAuth } from "@/components/channel-wizard/field-oauth";
import type { ConfigField } from "@/lib/channel-manifests";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const slackOAuthField: ConfigField = {
  key: "oauthToken",
  label: "OAuth Token",
  type: "string",
  required: true,
  secret: true,
  setupFlow: "oauth",
  oauthProvider: "slack",
  placeholder: "Click Authorize to connect",
  description: "This will open a Slack OAuth window.",
};

const fieldNoProvider: ConfigField = {
  key: "oauthToken",
  label: "OAuth Token",
  type: "string",
  required: true,
  setupFlow: "oauth",
  // no oauthProvider
};

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Default: fetch returns empty (unauthenticated)
  global.fetch = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FieldOAuth", () => {
  it("renders Authorize button in idle state", () => {
    render(<FieldOAuth field={slackOAuthField} value="" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Authorize" })).toBeInTheDocument();
    expect(screen.getByText("OAuth Token")).toBeInTheDocument();
    expect(screen.getByText("This will open a Slack OAuth window.")).toBeInTheDocument();
  });

  it("shows Re-authorize button when value is already set", () => {
    render(<FieldOAuth field={slackOAuthField} value="xoxb-existing-token" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Re-authorize" })).toBeInTheDocument();
    expect(screen.getByText("Connected")).toBeInTheDocument();
  });

  it("shows error prop message", () => {
    render(
      <FieldOAuth field={slackOAuthField} value="" onChange={vi.fn()} error="Token is required" />,
    );
    expect(screen.getByText("Token is required")).toBeInTheDocument();
  });

  it("shows error when no oauthProvider is configured", async () => {
    // window.open returns a mock popup
    const mockPopup = { closed: false, close: vi.fn(), location: { href: "" } };
    vi.spyOn(window, "open").mockReturnValue(mockPopup as never);

    render(<FieldOAuth field={fieldNoProvider} value="" onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Authorize" }));

    await waitFor(() => {
      expect(screen.getByText("No OAuth provider configured for this field")).toBeInTheDocument();
    });
  });

  it("shows error when popup is blocked", async () => {
    // window.open returns null (popup blocked)
    vi.spyOn(window, "open").mockReturnValue(null);

    render(<FieldOAuth field={slackOAuthField} value="" onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Authorize" }));

    await waitFor(() => {
      expect(
        screen.getByText("Popup blocked. Please allow popups for this site and try again."),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("calls POST /api/channel-oauth/initiate on click", async () => {
    const mockPopup = { closed: false, close: vi.fn(), location: { href: "" } };
    vi.spyOn(window, "open").mockReturnValue(mockPopup as never);

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        authorizeUrl: "https://slack.com/oauth/authorize?foo=bar",
        state: "test-state-uuid",
      }),
    } as never);

    render(<FieldOAuth field={slackOAuthField} value="" onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Authorize" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/channel-oauth/initiate"),
        expect.objectContaining({
          method: "POST",
          credentials: "include",
          body: JSON.stringify({ provider: "slack" }),
        }),
      );
    });
  });

  it("navigates popup to authorizeUrl after successful initiate", async () => {
    const mockPopup = { closed: false, close: vi.fn(), location: { href: "" } };
    vi.spyOn(window, "open").mockReturnValue(mockPopup as never);

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        authorizeUrl: "https://slack.com/oauth/v2/authorize?state=abc123",
        state: "abc123",
      }),
    } as never);

    render(<FieldOAuth field={slackOAuthField} value="" onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Authorize" }));

    await waitFor(() => {
      expect(mockPopup.location.href).toBe("https://slack.com/oauth/v2/authorize?state=abc123");
    });
  });

  it("shows Authorizing... while waiting for popup", async () => {
    const mockPopup = { closed: false, close: vi.fn(), location: { href: "" } };
    vi.spyOn(window, "open").mockReturnValue(mockPopup as never);

    // Slow fetch — never resolves during the test
    vi.mocked(global.fetch).mockReturnValue(
      new Promise(() => {
        /* never resolves — keep loading state for test */
      }),
    );

    render(<FieldOAuth field={slackOAuthField} value="" onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Authorize" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Authorizing..." })).toBeInTheDocument();
    });
  });

  it("polls for token after receiving postMessage success and calls onChange", async () => {
    const mockPopup = { closed: false, close: vi.fn(), location: { href: "" } };
    vi.spyOn(window, "open").mockReturnValue(mockPopup as never);

    // initiate call
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          authorizeUrl: "https://slack.com/oauth/v2/authorize",
          state: "state-xyz",
        }),
      } as never)
      // poll call — returns completed
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "completed", token: "xoxb-real-token-789" }),
      } as never);

    const onChange = vi.fn();
    render(<FieldOAuth field={slackOAuthField} value="" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Authorize" }));

    // Wait for initiate fetch to complete
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    // Simulate postMessage from the OAuth popup
    fireEvent(
      window,
      new MessageEvent("message", {
        data: { type: "platform-oauth-callback", status: "success", state: "state-xyz" },
        origin: window.location.origin,
      }),
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/channel-oauth/poll?state=state-xyz"),
        expect.objectContaining({ credentials: "include" }),
      );
    });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith("oauthToken", "xoxb-real-token-789");
    });

    expect(screen.getByRole("button", { name: "Re-authorize" })).toBeInTheDocument();
    expect(screen.getByText("Connected")).toBeInTheDocument();
  });

  it("shows error when postMessage reports an error", async () => {
    const mockPopup = { closed: false, close: vi.fn(), location: { href: "" } };
    vi.spyOn(window, "open").mockReturnValue(mockPopup as never);

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        authorizeUrl: "https://slack.com/oauth/v2/authorize",
        state: "state-abc",
      }),
    } as never);

    render(<FieldOAuth field={slackOAuthField} value="" onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Authorize" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    fireEvent(
      window,
      new MessageEvent("message", {
        data: { type: "platform-oauth-callback", status: "error", error: "access_denied" },
        origin: window.location.origin,
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("access_denied")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("ignores postMessage from a different origin", async () => {
    const mockPopup = { closed: false, close: vi.fn(), location: { href: "" } };
    vi.spyOn(window, "open").mockReturnValue(mockPopup as never);

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        authorizeUrl: "https://slack.com/oauth/v2/authorize",
        state: "state-def",
      }),
    } as never);

    const onChange = vi.fn();
    render(<FieldOAuth field={slackOAuthField} value="" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Authorize" }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    // Message from a different origin — should be ignored
    fireEvent(
      window,
      new MessageEvent("message", {
        data: { type: "platform-oauth-callback", status: "success", state: "state-def" },
        origin: "https://evil.example.com",
      }),
    );

    // onChange should NOT have been called
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows error when initiate returns an error response", async () => {
    const mockPopup = { closed: false, close: vi.fn(), location: { href: "" } };
    vi.spyOn(window, "open").mockReturnValue(mockPopup as never);

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "OAuth not configured for provider: slack" }),
    } as never);

    render(<FieldOAuth field={slackOAuthField} value="" onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Authorize" }));

    await waitFor(() => {
      expect(screen.getByText("OAuth not configured for provider: slack")).toBeInTheDocument();
    });
  });
});
