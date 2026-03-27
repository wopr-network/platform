import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAsync } from "../use-async";

describe("useAsync", () => {
  it("starts in idle state", () => {
    const asyncFn = vi.fn().mockResolvedValue("done");
    const { result } = renderHook(() => useAsync(asyncFn));

    expect(result.current.status).toBe("idle");
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });

  it("transitions to loading then success", async () => {
    let resolve!: (v: string) => void;
    const promise = new Promise<string>((r) => {
      resolve = r;
    });
    const asyncFn = vi.fn().mockReturnValue(promise);
    const { result } = renderHook(() => useAsync(asyncFn));

    act(() => {
      result.current.execute();
    });

    expect(result.current.status).toBe("loading");
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolve("hello");
    });

    await waitFor(() => {
      expect(result.current.status).toBe("success");
    });

    expect(result.current.data).toBe("hello");
    expect(result.current.error).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });

  it("transitions to loading then error", async () => {
    const asyncFn = vi.fn().mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useAsync(asyncFn));

    await act(async () => {
      result.current.execute();
    });

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe("boom");
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });

  it("passes arguments through to the async function", async () => {
    const asyncFn = vi.fn().mockResolvedValue("ok");
    const { result } = renderHook(() => useAsync(asyncFn));

    await act(async () => {
      result.current.execute("arg1", 42);
    });

    await waitFor(() => expect(result.current.status).toBe("success"));
    expect(asyncFn).toHaveBeenCalledWith("arg1", 42);
  });

  it("ignores stale results after unmount", async () => {
    let resolve!: (v: string) => void;
    const promise = new Promise<string>((r) => {
      resolve = r;
    });
    const asyncFn = vi.fn().mockReturnValue(promise);
    const { result, unmount } = renderHook(() => useAsync(asyncFn));

    act(() => {
      result.current.execute();
    });

    unmount();

    // Resolving after unmount should not throw
    await act(async () => {
      resolve("late");
    });
  });

  it("resets state on new execute call", async () => {
    const asyncFn = vi.fn().mockRejectedValueOnce(new Error("fail")).mockResolvedValueOnce("ok");

    const { result } = renderHook(() => useAsync(asyncFn));

    await act(async () => {
      result.current.execute();
    });

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error?.message).toBe("fail");

    await act(async () => {
      result.current.execute();
    });

    await waitFor(() => expect(result.current.status).toBe("success"));
    expect(result.current.data).toBe("ok");
    expect(result.current.error).toBeUndefined();
  });

  it("wraps non-Error rejects in Error", async () => {
    const asyncFn = vi.fn().mockRejectedValue("string-error");
    const { result } = renderHook(() => useAsync(asyncFn));

    await act(async () => {
      result.current.execute();
    });

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe("string-error");
  });
});
