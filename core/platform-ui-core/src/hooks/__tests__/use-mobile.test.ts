import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useIsMobile } from "../use-mobile";

describe("useIsMobile", () => {
  let changeHandler: (() => void) | null;
  let originalMatchMedia: typeof window.matchMedia;
  let mqlInstance: {
    matches: boolean;
    media: string;
    onchange: null;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
    addListener: ReturnType<typeof vi.fn>;
    removeListener: ReturnType<typeof vi.fn>;
    dispatchEvent: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    changeHandler = null;
    originalMatchMedia = window.matchMedia;

    mqlInstance = {
      matches: false,
      media: "",
      onchange: null,
      addEventListener: vi.fn((_event: string, handler: () => void) => {
        changeHandler = handler;
      }),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };

    window.matchMedia = vi.fn((query: string) => {
      mqlInstance.media = query;
      return mqlInstance;
    }) as unknown as typeof window.matchMedia;
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it("returns false on desktop (wide viewport)", () => {
    mqlInstance.matches = false; // max-width: 1023px does NOT match => desktop
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("returns true on mobile (narrow viewport)", () => {
    mqlInstance.matches = true; // max-width: 1023px matches => mobile
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("uses default breakpoint of 1024 (query: max-width: 1023px)", () => {
    renderHook(() => useIsMobile());
    expect(window.matchMedia).toHaveBeenCalledWith("(max-width: 1023px)");
  });

  it("accepts a custom breakpoint", () => {
    renderHook(() => useIsMobile(768));
    expect(window.matchMedia).toHaveBeenCalledWith("(max-width: 767px)");
  });

  it("updates when media query change event fires", () => {
    mqlInstance.matches = false;
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    act(() => {
      mqlInstance.matches = true;
      if (changeHandler) changeHandler();
    });

    expect(result.current).toBe(true);
  });

  it("cleans up event listener on unmount", () => {
    const { unmount } = renderHook(() => useIsMobile());
    unmount();
    expect(mqlInstance.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });
});
