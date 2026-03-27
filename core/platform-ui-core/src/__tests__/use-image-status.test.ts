import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useImageStatus } from "@/hooks/use-image-status";

vi.mock("@/lib/api", () => ({
  getImageStatus: vi.fn(),
  apiFetch: vi.fn(),
}));

import { getImageStatus } from "@/lib/api";

const mockGetImageStatus = vi.mocked(getImageStatus);

describe("useImageStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error: null on success", async () => {
    mockGetImageStatus.mockResolvedValue({
      updateAvailable: true,
      currentDigest: "sha256:abc",
      latestDigest: "sha256:def",
    });
    const { result } = renderHook(() => useImageStatus("inst-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.updateAvailable).toBe(true);
  });

  it("sets error when getImageStatus returns null", async () => {
    mockGetImageStatus.mockResolvedValue(null);
    const { result } = renderHook(() => useImageStatus("inst-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Failed to fetch image status");
    expect(result.current.updateAvailable).toBe(false);
  });

  it("clears stale data when getImageStatus returns null", async () => {
    mockGetImageStatus.mockResolvedValueOnce({
      updateAvailable: true,
      currentDigest: "sha256:abc",
      latestDigest: "sha256:def",
    });
    const { result } = renderHook(() => useImageStatus("inst-1"));
    await waitFor(() => expect(result.current.updateAvailable).toBe(true));

    mockGetImageStatus.mockResolvedValue(null);
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.error).toBe("Failed to fetch image status");
    expect(result.current.updateAvailable).toBe(false);
  });

  it("clears error on successful retry after failure", async () => {
    mockGetImageStatus.mockResolvedValueOnce(null);
    const { result } = renderHook(() => useImageStatus("inst-1"));
    await waitFor(() => expect(result.current.error).toBe("Failed to fetch image status"));

    mockGetImageStatus.mockResolvedValue({
      updateAvailable: false,
      currentDigest: "sha256:abc",
      latestDigest: "sha256:abc",
    });
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.error).toBeNull();
  });

  it("returns error: null when id is null", () => {
    const { result } = renderHook(() => useImageStatus(null));
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
