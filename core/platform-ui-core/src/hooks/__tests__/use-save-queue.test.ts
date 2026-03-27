import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSaveQueue } from "../use-save-queue";

describe("useSaveQueue", () => {
  it("calls the save function with the provided payload", async () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useSaveQueue(saveFn));

    await act(async () => {
      result.current.enqueue({ name: "Bot A" });
    });

    await waitFor(() => expect(result.current.saving).toBe(false));

    expect(saveFn).toHaveBeenCalledOnce();
    expect(saveFn).toHaveBeenCalledWith({ name: "Bot A" });
  });

  it("coalesces concurrent saves — only runs latest payload when one is in flight", async () => {
    let resolveFirst!: () => void;
    const firstPromise = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });

    const saveFn = vi.fn().mockReturnValueOnce(firstPromise).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useSaveQueue(saveFn));

    // First save kicks off immediately
    act(() => {
      result.current.enqueue({ name: "Bot A" });
    });

    // Two more arrive while first is in-flight — only last should run
    act(() => {
      result.current.enqueue({ name: "Bot B" });
      result.current.enqueue({ name: "Bot C" });
    });

    // Resolve first save
    await act(async () => {
      resolveFirst();
    });

    await waitFor(() => expect(result.current.saving).toBe(false));

    // saveFn called twice: first with A, then with C (B coalesced away)
    expect(saveFn).toHaveBeenCalledTimes(2);
    expect(saveFn).toHaveBeenNthCalledWith(1, { name: "Bot A" });
    expect(saveFn).toHaveBeenNthCalledWith(2, { name: "Bot C" });
  });

  it("sets saving=true while a save is in flight", async () => {
    let resolveFirst!: () => void;
    const firstPromise = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const saveFn = vi.fn().mockReturnValueOnce(firstPromise);

    const { result } = renderHook(() => useSaveQueue(saveFn));

    act(() => {
      result.current.enqueue({ name: "Bot A" });
    });

    expect(result.current.saving).toBe(true);

    await act(async () => {
      resolveFirst();
    });

    await waitFor(() => expect(result.current.saving).toBe(false));
  });

  it("sets error on save failure and clears it on next successful save", async () => {
    const saveFn = vi
      .fn()
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useSaveQueue(saveFn));

    await act(async () => {
      result.current.enqueue({ name: "Bot A" });
    });

    await waitFor(() => expect(result.current.error).toBe("network error"));
    expect(result.current.saving).toBe(false);

    await act(async () => {
      result.current.enqueue({ name: "Bot B" });
    });

    await waitFor(() => expect(result.current.error).toBe(null));
    expect(result.current.saving).toBe(false);
  });

  it("clears error when new save starts", async () => {
    let resolveSecond!: () => void;
    const secondPromise = new Promise<void>((resolve) => {
      resolveSecond = resolve;
    });

    const saveFn = vi
      .fn()
      .mockRejectedValueOnce(new Error("oops"))
      .mockReturnValueOnce(secondPromise);

    const { result } = renderHook(() => useSaveQueue(saveFn));

    await act(async () => {
      result.current.enqueue({ name: "Bot A" });
    });

    await waitFor(() => expect(result.current.error).toBe("oops"));

    act(() => {
      result.current.enqueue({ name: "Bot B" });
    });

    // Error should be cleared as soon as next save starts
    await waitFor(() => expect(result.current.error).toBe(null));

    await act(async () => {
      resolveSecond();
    });

    await waitFor(() => expect(result.current.saving).toBe(false));
  });

  it("does not call saveFn when no payload is enqueued", () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useSaveQueue(saveFn));

    expect(saveFn).not.toHaveBeenCalled();
  });

  it("runs a second save immediately if nothing is in-flight", async () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useSaveQueue(saveFn));

    await act(async () => {
      result.current.enqueue({ name: "Bot A" });
    });

    await waitFor(() => expect(result.current.saving).toBe(false));

    await act(async () => {
      result.current.enqueue({ name: "Bot B" });
    });

    await waitFor(() => expect(result.current.saving).toBe(false));

    expect(saveFn).toHaveBeenCalledTimes(2);
    expect(saveFn).toHaveBeenNthCalledWith(1, { name: "Bot A" });
    expect(saveFn).toHaveBeenNthCalledWith(2, { name: "Bot B" });
  });
});
