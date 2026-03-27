import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-config", () => ({
  API_BASE_URL: "http://localhost:3001/api",
  PLATFORM_BASE_URL: "http://localhost:3001",
}));

vi.mock("@/lib/fetch-utils", () => ({
  handleUnauthorized: vi.fn(),
  UnauthorizedError: class extends Error {
    constructor(msg = "Session expired") {
      super(msg);
      this.name = "UnauthorizedError";
    }
  },
}));

const mockListCapabilityMeta = vi.fn();

vi.mock("@/lib/trpc", () => ({
  trpcVanilla: {
    capabilities: {
      listCapabilityMeta: { query: (...args: unknown[]) => mockListCapabilityMeta(...args) },
    },
  },
}));

import { renderHook, waitFor } from "@testing-library/react";
import { useCapabilityMeta } from "@/hooks/use-capability-meta";
import type { CapabilityMetaEntry } from "@/lib/api";
import { fetchCapabilityMeta } from "@/lib/settings-api";

describe("fetchCapabilityMeta", () => {
  beforeEach(() => {
    mockListCapabilityMeta.mockReset();
  });

  it("returns metadata from tRPC procedure", async () => {
    const mockData: CapabilityMetaEntry[] = [
      {
        capability: "transcription",
        label: "Transcription",
        description: "Powered by Whisper.",
        pricing: "$0.006/min",
        hostedProvider: "Whisper",
        icon: "mic",
        sortOrder: 0,
      },
    ];
    mockListCapabilityMeta.mockResolvedValue(mockData);
    const result = await fetchCapabilityMeta();
    expect(result).toEqual(mockData);
    expect(mockListCapabilityMeta).toHaveBeenCalledOnce();
  });

  it("throws on tRPC error (caller handles fallback)", async () => {
    mockListCapabilityMeta.mockRejectedValue(new Error("Network error"));
    await expect(fetchCapabilityMeta()).rejects.toThrow("Network error");
  });
});

describe("useCapabilityMeta hook", () => {
  beforeEach(() => {
    mockListCapabilityMeta.mockReset();
  });

  it("returns metadata from API when available", async () => {
    const mockData: CapabilityMetaEntry[] = [
      {
        capability: "transcription",
        label: "Transcription",
        description: "Powered by Whisper.",
        pricing: "$0.006/min",
        hostedProvider: "Whisper",
        icon: "mic",
        sortOrder: 0,
      },
      {
        capability: "text-gen",
        label: "Text Generation",
        description: "200+ models.",
        pricing: "$0.002/1K tokens",
        hostedProvider: "OpenRouter",
        icon: "bot",
        sortOrder: 2,
      },
    ];
    mockListCapabilityMeta.mockResolvedValue(mockData);

    const { result } = renderHook(() => useCapabilityMeta());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.meta).toEqual(mockData);
    expect(result.current.error).toBe(false);
  });

  it("falls back to defaults when API fails", async () => {
    mockListCapabilityMeta.mockRejectedValue(new Error("fail"));

    const { result } = renderHook(() => useCapabilityMeta());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(true);
    expect(result.current.meta.length).toBeGreaterThan(0);
    expect(result.current.meta[0].capability).toBe("transcription");
  });

  it("returns meta sorted by sortOrder", async () => {
    const unsorted: CapabilityMetaEntry[] = [
      {
        capability: "b",
        label: "B",
        description: "",
        pricing: "",
        hostedProvider: "",
        icon: "bot",
        sortOrder: 2,
      },
      {
        capability: "a",
        label: "A",
        description: "",
        pricing: "",
        hostedProvider: "",
        icon: "bot",
        sortOrder: 1,
      },
    ];
    mockListCapabilityMeta.mockResolvedValue(unsorted);

    const { result } = renderHook(() => useCapabilityMeta());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.meta[0].capability).toBe("a");
    expect(result.current.meta[1].capability).toBe("b");
  });

  it("getMeta returns entry for known capability and fallback for unknown", async () => {
    const data: CapabilityMetaEntry[] = [
      {
        capability: "transcription",
        label: "Transcription",
        description: "Desc",
        pricing: "$1",
        hostedProvider: "W",
        icon: "mic",
        sortOrder: 0,
      },
    ];
    mockListCapabilityMeta.mockResolvedValue(data);

    const { result } = renderHook(() => useCapabilityMeta());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.getMeta("transcription").label).toBe("Transcription");

    const unknown = result.current.getMeta("brand-new-cap");
    expect(unknown.label).toBe("Brand New Cap");
    expect(unknown.icon).toBe("sparkles");
  });
});
