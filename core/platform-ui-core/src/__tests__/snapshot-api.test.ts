import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

vi.mock("@/lib/api-config", () => ({
  API_BASE_URL: "http://localhost:3001/api",
  PLATFORM_BASE_URL: "http://localhost:3001",
}));

vi.mock("@/lib/fetch-utils", () => ({
  handleUnauthorized: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpcVanilla: {},
}));

import { createSnapshot, deleteSnapshot, listSnapshots, restoreSnapshot } from "@/lib/api";

describe("Snapshot API functions", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("listSnapshots calls GET /api/bots/:id/snapshots", async () => {
    const snapshots = [
      {
        id: "snap-1",
        instanceId: "bot-1",
        name: null,
        type: "nightly",
        trigger: "scheduled",
        sizeMb: 42,
        createdAt: "2026-02-20T00:00:00Z",
        expiresAt: null,
      },
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ snapshots }),
    });

    const result = await listSnapshots("bot-1");
    expect(result).toEqual(snapshots);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/bots/bot-1/snapshots",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it("createSnapshot calls POST /api/bots/:id/snapshots", async () => {
    const snapshot = {
      id: "snap-2",
      instanceId: "bot-1",
      name: "my backup",
      type: "on-demand",
      trigger: "manual",
      sizeMb: 10,
      createdAt: "2026-02-20T01:00:00Z",
      expiresAt: null,
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ snapshot, estimatedMonthlyCost: "$0.01/month" }),
    });

    const result = await createSnapshot("bot-1", "my backup");
    expect(result.snapshot).toEqual(snapshot);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/bots/bot-1/snapshots",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });

  it("restoreSnapshot calls POST /api/instances/:id/snapshots/:sid/restore", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true, restored: "snap-1" }),
    });

    await restoreSnapshot("bot-1", "snap-1");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/instances/bot-1/snapshots/snap-1/restore",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });

  it("deleteSnapshot calls DELETE /api/bots/:id/snapshots/:sid", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
    });

    await deleteSnapshot("bot-1", "snap-1");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/bots/bot-1/snapshots/snap-1",
      expect.objectContaining({ method: "DELETE", credentials: "include" }),
    );
  });
});
