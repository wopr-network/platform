import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockReplace = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => "/admin/users",
  useSearchParams: () => mockSearchParams,
}));

import { usePaginationParams } from "@/hooks/use-pagination-params";

describe("usePaginationParams", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockSearchParams = new URLSearchParams();
  });

  it("defaults to page 1 with offset 0", () => {
    const { result } = renderHook(() => usePaginationParams());
    expect(result.current.page).toBe(1);
    expect(result.current.offset).toBe(0);
  });

  it("uses default pageSize of 20", () => {
    mockSearchParams = new URLSearchParams("page=3");
    const { result } = renderHook(() => usePaginationParams());
    expect(result.current.page).toBe(3);
    expect(result.current.offset).toBe(40);
  });

  it("accepts custom pageSize", () => {
    mockSearchParams = new URLSearchParams("page=2");
    const { result } = renderHook(() => usePaginationParams(10));
    expect(result.current.page).toBe(2);
    expect(result.current.offset).toBe(10);
  });

  it("clamps invalid negative page param to 1", () => {
    mockSearchParams = new URLSearchParams("page=-5");
    const { result } = renderHook(() => usePaginationParams());
    expect(result.current.page).toBe(1);
    expect(result.current.offset).toBe(0);
  });

  it("clamps non-numeric page param to 1", () => {
    mockSearchParams = new URLSearchParams("page=abc");
    const { result } = renderHook(() => usePaginationParams());
    expect(result.current.page).toBe(1);
    expect(result.current.offset).toBe(0);
  });

  it("setPage(3) updates URL with page=3", () => {
    const { result } = renderHook(() => usePaginationParams());
    act(() => {
      result.current.setPage(3);
    });
    expect(mockReplace).toHaveBeenCalledWith("/admin/users?page=3", { scroll: false });
  });

  it("setPage(1) removes page param from URL", () => {
    mockSearchParams = new URLSearchParams("page=5");
    const { result } = renderHook(() => usePaginationParams());
    act(() => {
      result.current.setPage(1);
    });
    expect(mockReplace).toHaveBeenCalledWith("/admin/users", { scroll: false });
  });

  it("setPage preserves other query params", () => {
    mockSearchParams = new URLSearchParams("sort=name&page=1");
    const { result } = renderHook(() => usePaginationParams());
    act(() => {
      result.current.setPage(2);
    });
    expect(mockReplace).toHaveBeenCalledWith("/admin/users?sort=name&page=2", { scroll: false });
  });

  it("setPage(0) removes page param (clamped to <=1)", () => {
    const { result } = renderHook(() => usePaginationParams());
    act(() => {
      result.current.setPage(0);
    });
    expect(mockReplace).toHaveBeenCalledWith("/admin/users", { scroll: false });
  });
});
