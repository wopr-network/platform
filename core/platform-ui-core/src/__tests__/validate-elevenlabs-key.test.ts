import { beforeEach, describe, expect, it, vi } from "vitest";

const mockTestProviderKey = vi.fn();
const mockSaveProviderKey = vi.fn();

vi.mock("@/lib/settings-api", () => ({
  testProviderKey: (...args: unknown[]) => mockTestProviderKey(...args),
  saveProviderKey: (...args: unknown[]) => mockSaveProviderKey(...args),
}));

// Still need these mocks because api.ts imports them at module level
const mockFetch = vi.fn();
global.fetch = mockFetch;

vi.mock("@/lib/api-config", () => ({
  API_BASE_URL: "http://localhost:3001/api",
  PLATFORM_BASE_URL: "http://localhost:3001",
}));

vi.mock("@/lib/fetch-utils", () => ({
  handleUnauthorized: vi.fn(() => {
    throw new Error("Unauthorized");
  }),
  UnauthorizedError: class extends Error {
    constructor(msg = "Session expired") {
      super(msg);
      this.name = "UnauthorizedError";
    }
  },
}));

vi.mock("@/lib/trpc", () => ({
  trpcVanilla: {},
}));

import { validateElevenLabsKey } from "@/lib/api";

describe("validateElevenLabsKey", () => {
  beforeEach(() => {
    mockTestProviderKey.mockReset();
    mockSaveProviderKey.mockReset();
    mockFetch.mockReset();
  });

  it("does NOT call elevenlabs.io directly", async () => {
    mockTestProviderKey.mockResolvedValue({ valid: true });
    mockSaveProviderKey.mockResolvedValue({ ok: true, id: "1", provider: "elevenlabs" });

    await validateElevenLabsKey("test-key");

    // fetch should NOT have been called with any elevenlabs.io URL
    for (const call of mockFetch.mock.calls) {
      const url = typeof call[0] === "string" ? call[0] : (call[0]?.toString?.() ?? "");
      expect(url).not.toContain("elevenlabs.io");
    }
  });

  it("calls testProviderKey with provider=elevenlabs", async () => {
    mockTestProviderKey.mockResolvedValue({ valid: true });
    mockSaveProviderKey.mockResolvedValue({ ok: true, id: "1", provider: "elevenlabs" });

    const result = await validateElevenLabsKey("test-key");

    expect(mockTestProviderKey).toHaveBeenCalledWith("elevenlabs", "test-key");
    expect(result.valid).toBe(true);
  });

  it("stores key after successful validation", async () => {
    mockTestProviderKey.mockResolvedValue({ valid: true });
    mockSaveProviderKey.mockResolvedValue({ ok: true, id: "1", provider: "elevenlabs" });

    await validateElevenLabsKey("test-key");

    expect(mockSaveProviderKey).toHaveBeenCalledWith("elevenlabs", "test-key");
  });

  it("does NOT store key when validation fails", async () => {
    mockTestProviderKey.mockResolvedValue({ valid: false, error: "Invalid API key" });

    const result = await validateElevenLabsKey("bad-key");

    expect(result.valid).toBe(false);
    expect(result.message).toBe("Invalid API key");
    expect(mockSaveProviderKey).not.toHaveBeenCalled();
  });

  it("returns error when testProviderKey throws", async () => {
    mockTestProviderKey.mockRejectedValue(new Error("Network error"));

    const result = await validateElevenLabsKey("any-key");

    expect(result.valid).toBe(false);
    expect(result.message).toBe("Could not validate key. Please try again.");
  });
});
