import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useLocalStorage } from "../use-local-storage";

describe("useLocalStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns the initial value when key is missing", () => {
    const { result } = renderHook(() => useLocalStorage("test-key", "default"));
    expect(result.current[0]).toBe("default");
  });

  it("reads an existing value from localStorage", () => {
    localStorage.setItem("test-key", JSON.stringify("stored"));
    const { result } = renderHook(() => useLocalStorage("test-key", "default"));
    expect(result.current[0]).toBe("stored");
  });

  it("writes to localStorage when setValue is called", () => {
    const { result } = renderHook(() => useLocalStorage("test-key", "default"));

    act(() => {
      result.current[1]("updated");
    });

    expect(result.current[0]).toBe("updated");
    const raw = localStorage.getItem("test-key");
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toBe("updated");
  });

  it("removes the key when removeValue is called", () => {
    localStorage.setItem("test-key", JSON.stringify("stored"));
    const { result } = renderHook(() => useLocalStorage("test-key", "default"));

    act(() => {
      result.current[2]();
    });

    expect(result.current[0]).toBe("default");
    expect(localStorage.getItem("test-key")).toBeNull();
  });

  it("handles non-JSON values gracefully (falls back to initial)", () => {
    localStorage.setItem("test-key", "not-valid-json{{{");
    const { result } = renderHook(() => useLocalStorage("test-key", "fallback"));
    expect(result.current[0]).toBe("fallback");
  });

  it("supports object values", () => {
    const { result } = renderHook(() => useLocalStorage("obj-key", { count: 0 }));

    act(() => {
      result.current[1]({ count: 42 });
    });

    expect(result.current[0]).toEqual({ count: 42 });
    const rawObj = localStorage.getItem("obj-key");
    expect(rawObj).not.toBeNull();
    expect(JSON.parse(rawObj as string)).toEqual({ count: 42 });
  });

  it("supports function updater like useState", () => {
    const { result } = renderHook(() => useLocalStorage("num-key", 10));

    act(() => {
      result.current[1]((prev) => prev + 5);
    });

    expect(result.current[0]).toBe(15);
  });
});
