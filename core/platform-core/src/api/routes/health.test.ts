import { describe, expect, it, vi } from "vitest";
import type { BackupStatusStore } from "../../backup/backup-status-store.js";
import { createHealthRoutes } from "./health.js";

function createMockStore(staleCount: number, totalCount: number): BackupStatusStore {
  return {
    listStale: vi.fn().mockReturnValue(Array(staleCount).fill({ isStale: true })),
    count: vi.fn().mockReturnValue(totalCount),
    listAll: vi.fn().mockReturnValue([]),
    get: vi.fn().mockReturnValue(null),
    recordSuccess: vi.fn(),
    recordFailure: vi.fn(),
  } as unknown as BackupStatusStore;
}

describe("createHealthRoutes", () => {
  it("returns ok with configured service name", async () => {
    const routes = createHealthRoutes({ serviceName: "test-service" });
    const res = await routes.request("/");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.service).toBe("test-service");
  });

  it("returns ok when no backup store is available", async () => {
    const routes = createHealthRoutes({ serviceName: "my-platform" });
    const res = await routes.request("/");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.backups).toBeUndefined();
  });

  it("returns ok with backup info when all backups fresh", async () => {
    const store = createMockStore(0, 5);
    const routes = createHealthRoutes({ serviceName: "my-platform", storeFactory: () => store });
    const res = await routes.request("/");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.backups).toEqual({ staleCount: 0, totalTracked: 5 });
  });

  it("returns degraded when stale backups exist", async () => {
    const store = createMockStore(2, 5);
    const routes = createHealthRoutes({ serviceName: "my-platform", storeFactory: () => store });
    const res = await routes.request("/");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("degraded");
    expect(body.backups).toEqual({ staleCount: 2, totalTracked: 5 });
  });

  it("does not crash when backup store throws", async () => {
    const store = {
      listStale: vi.fn().mockImplementation(() => {
        throw new Error("DB locked");
      }),
      count: vi.fn().mockReturnValue(0),
    } as unknown as BackupStatusStore;
    const routes = createHealthRoutes({ serviceName: "my-platform", storeFactory: () => store });
    const res = await routes.request("/");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.backups).toBeUndefined();
  });

  it("uses different service names per brand", async () => {
    const wopr = createHealthRoutes({ serviceName: "wopr-platform" });
    const silo = createHealthRoutes({ serviceName: "silo" });

    const woprBody = await (await wopr.request("/")).json();
    const siloBody = await (await silo.request("/")).json();

    expect(woprBody.service).toBe("wopr-platform");
    expect(siloBody.service).toBe("silo");
  });
});
