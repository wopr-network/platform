import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCountUp } from "../use-count-up";

describe("useCountUp", () => {
  let rafCallbacks: Array<(time: number) => void>;
  let rafId: number;
  let originalRaf: typeof requestAnimationFrame;
  let originalCaf: typeof cancelAnimationFrame;
  let originalPerformanceNow: typeof performance.now;
  let currentTime: number;

  beforeEach(() => {
    rafCallbacks = [];
    rafId = 0;
    currentTime = 0;

    originalRaf = globalThis.requestAnimationFrame;
    originalCaf = globalThis.cancelAnimationFrame;
    originalPerformanceNow = performance.now;

    performance.now = vi.fn(() => currentTime);

    globalThis.requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
      rafCallbacks.push(cb as (time: number) => void);
      return ++rafId;
    }) as typeof requestAnimationFrame;

    globalThis.cancelAnimationFrame = vi.fn();
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRaf;
    globalThis.cancelAnimationFrame = originalCaf;
    performance.now = originalPerformanceNow;
  });

  function flushRaf() {
    const cbs = [...rafCallbacks];
    rafCallbacks = [];
    for (const cb of cbs) {
      cb(currentTime);
    }
  }

  it("starts at 0", () => {
    const { result } = renderHook(() => useCountUp(100));
    expect(result.current).toBe(0);
  });

  it("reaches target value after full duration", () => {
    currentTime = 0;
    const { result } = renderHook(() => useCountUp(100, 1000));

    // First rAF fires — start = 0, now = 0, elapsed = 0, progress = 0
    act(() => flushRaf());

    // Advance to end of duration
    currentTime = 1000;
    act(() => flushRaf());

    // progress = min(1000/1000, 1) = 1, eased = 1 - (1-1)^3 = 1, value = 100
    expect(result.current).toBe(100);
  });

  it("animates with easeOutCubic at midpoint", () => {
    currentTime = 0;
    const { result } = renderHook(() => useCountUp(100, 1000));

    act(() => flushRaf());

    // At 50% time
    currentTime = 500;
    act(() => flushRaf());

    // progress = 0.5, eased = 1 - (1-0.5)^3 = 1 - 0.125 = 0.875
    expect(result.current).toBe(87.5);
  });

  it("sets value to 0 for zero target", () => {
    const { result } = renderHook(() => useCountUp(0));
    expect(result.current).toBe(0);
  });

  it("sets value to 0 for negative target", () => {
    const { result } = renderHook(() => useCountUp(-50));
    expect(result.current).toBe(0);
  });

  it("does not schedule rAF for target <= 0", () => {
    renderHook(() => useCountUp(0));
    expect(globalThis.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("cancels animation frame on unmount", () => {
    currentTime = 0;
    const { unmount } = renderHook(() => useCountUp(100, 1000));

    act(() => flushRaf());

    unmount();
    expect(globalThis.cancelAnimationFrame).toHaveBeenCalled();
  });

  it("uses default duration of 1200", () => {
    currentTime = 0;
    const { result } = renderHook(() => useCountUp(100));

    act(() => flushRaf());

    currentTime = 1200;
    act(() => flushRaf());

    expect(result.current).toBe(100);
  });

  it("stops scheduling rAF after completion", () => {
    currentTime = 0;
    renderHook(() => useCountUp(100, 1000));

    act(() => flushRaf());

    currentTime = 1000;
    act(() => flushRaf());

    // After completion, no more callbacks should be queued
    expect(rafCallbacks).toHaveLength(0);
  });
});
