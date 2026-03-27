import { describe, expect, it, vi } from "vitest";
import { gracefulShutdown, startBackgroundServices } from "../lifecycle.js";
import { createTestContainer } from "../test-container.js";

describe("startBackgroundServices", () => {
  it("returns a BackgroundHandles object", async () => {
    const container = createTestContainer();
    const handles = await startBackgroundServices(container);
    expect(handles).toHaveProperty("intervals");
    expect(handles).toHaveProperty("unsubscribes");
    expect(Array.isArray(handles.intervals)).toBe(true);
    expect(Array.isArray(handles.unsubscribes)).toBe(true);
  });

  it("calls proxy.start when fleet is enabled", async () => {
    const startFn = vi.fn().mockResolvedValue(undefined);
    const container = createTestContainer({
      fleet: {
        manager: {} as never,
        docker: {} as never,
        proxy: {
          start: startFn,
          addRoute: async () => {},
          removeRoute: () => {},
          getRoutes: () => [],
        } as never,
        profileStore: { list: async () => [] } as never,
        serviceKeyRepo: {} as never,
      },
    });
    await startBackgroundServices(container);
    expect(startFn).toHaveBeenCalledOnce();
  });

  it("does not throw when proxy.start fails", async () => {
    const container = createTestContainer({
      fleet: {
        manager: {} as never,
        docker: {} as never,
        proxy: {
          start: async () => {
            throw new Error("proxy start failed");
          },
          addRoute: async () => {},
          removeRoute: () => {},
          getRoutes: () => [],
        } as never,
        profileStore: { list: async () => [] } as never,
        serviceKeyRepo: {} as never,
      },
    });
    // Should not throw
    const handles = await startBackgroundServices(container);
    expect(handles).toBeDefined();
  });
});

describe("gracefulShutdown", () => {
  it("clears all intervals", async () => {
    const container = createTestContainer();
    const clearSpy = vi.spyOn(global, "clearInterval");

    const interval1 = setInterval(() => {}, 10000);
    const interval2 = setInterval(() => {}, 10000);

    const handles = {
      intervals: [interval1, interval2],
      unsubscribes: [],
    };

    await gracefulShutdown(container, handles);

    expect(clearSpy).toHaveBeenCalledWith(interval1);
    expect(clearSpy).toHaveBeenCalledWith(interval2);
    clearSpy.mockRestore();
  });

  it("calls all unsubscribe functions", async () => {
    const container = createTestContainer();
    const unsub1 = vi.fn();
    const unsub2 = vi.fn();

    const handles = {
      intervals: [],
      unsubscribes: [unsub1, unsub2],
    };

    await gracefulShutdown(container, handles);

    expect(unsub1).toHaveBeenCalledOnce();
    expect(unsub2).toHaveBeenCalledOnce();
  });

  it("calls pool.end()", async () => {
    const endFn = vi.fn().mockResolvedValue(undefined);
    const container = createTestContainer({
      pool: { end: endFn } as never,
    });

    const handles = { intervals: [], unsubscribes: [] };

    await gracefulShutdown(container, handles);

    expect(endFn).toHaveBeenCalledOnce();
  });
});
