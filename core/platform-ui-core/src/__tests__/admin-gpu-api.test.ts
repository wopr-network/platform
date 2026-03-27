import { beforeEach, describe, expect, it, vi } from "vitest";

// ---- Mock apiFetch and apiFetchRaw ----
const { mockApiFetch, mockApiFetchRaw } = vi.hoisted(() => ({
  mockApiFetch: vi.fn(),
  mockApiFetchRaw: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: mockApiFetch,
  apiFetchRaw: mockApiFetchRaw,
}));

import type { GpuNode, GpuRegion, GpuSize } from "@/lib/admin-gpu-api";
import {
  destroyGpuNode,
  getGpuNode,
  listGpuNodes,
  listGpuRegions,
  listGpuSizes,
  provisionGpuNode,
  rebootGpuNode,
} from "@/lib/admin-gpu-api";

function fakeNode(overrides: Partial<GpuNode> = {}): GpuNode {
  return {
    id: "gpu-1",
    name: "test-node",
    region: "nyc3",
    size: "gpu-h100x1",
    status: "running",
    ipAddress: "10.0.0.1",
    utilization: 42,
    memoryUsedMib: 20480,
    memoryTotalMib: 81920,
    temperatureCelsius: 65,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function fakeRegion(overrides: Partial<GpuRegion> = {}): GpuRegion {
  return { slug: "nyc3", name: "New York 3", available: true, ...overrides };
}

function fakeSize(overrides: Partial<GpuSize> = {}): GpuSize {
  return {
    slug: "gpu-h100x1",
    name: "H100 x1",
    vcpus: 8,
    memoryMib: 131072,
    gpuCount: 1,
    gpuModel: "H100",
    priceMonthly: 2500,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listGpuNodes", () => {
  it("calls /admin/gpu and returns nodes", async () => {
    const nodes = [fakeNode()];
    mockApiFetch.mockResolvedValue(nodes);

    const result = await listGpuNodes();

    expect(mockApiFetch).toHaveBeenCalledWith("/admin/gpu");
    expect(result).toEqual(nodes);
  });

  it("throws when API fails", async () => {
    mockApiFetch.mockRejectedValue(new Error("API down"));
    await expect(listGpuNodes()).rejects.toThrow("API down");
  });
});

describe("getGpuNode", () => {
  it("calls /admin/gpu/:id", async () => {
    const node = fakeNode({ id: "gpu-42" });
    mockApiFetch.mockResolvedValue(node);

    const result = await getGpuNode("gpu-42");

    expect(mockApiFetch).toHaveBeenCalledWith("/admin/gpu/gpu-42");
    expect(result).toEqual(node);
  });

  it("throws when API fails", async () => {
    mockApiFetch.mockRejectedValue(new Error("Not found"));
    await expect(getGpuNode("gpu-99")).rejects.toThrow("Not found");
  });
});

describe("provisionGpuNode", () => {
  it("POSTs to /admin/gpu and returns new node", async () => {
    const node = fakeNode({ name: "new-node", status: "provisioning" });
    mockApiFetch.mockResolvedValue(node);

    const result = await provisionGpuNode({ name: "new-node", region: "nyc3", size: "gpu-h100x1" });

    expect(mockApiFetch).toHaveBeenCalledWith("/admin/gpu", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "new-node", region: "nyc3", size: "gpu-h100x1" }),
    });
    expect(result).toEqual(node);
  });

  it("throws when provisioning fails", async () => {
    mockApiFetch.mockRejectedValue(new Error("Quota exceeded"));
    await expect(
      provisionGpuNode({ name: "x", region: "nyc3", size: "gpu-h100x1" }),
    ).rejects.toThrow("Quota exceeded");
  });
});

describe("destroyGpuNode", () => {
  it("DELETEs /admin/gpu/:id", async () => {
    mockApiFetchRaw.mockResolvedValue({ ok: true } as Response);

    await destroyGpuNode("gpu-1");

    expect(mockApiFetchRaw).toHaveBeenCalledWith("/admin/gpu/gpu-1", { method: "DELETE" });
  });

  it("throws when destroy fails", async () => {
    mockApiFetchRaw.mockResolvedValue({
      ok: false,
      text: () => Promise.resolve("Destroy failed"),
    } as unknown as Response);
    await expect(destroyGpuNode("gpu-1")).rejects.toThrow("Destroy failed");
  });
});

describe("rebootGpuNode", () => {
  it("POSTs to /admin/gpu/:id/reboot", async () => {
    const updated = fakeNode({ status: "rebooting" });
    mockApiFetch.mockResolvedValue(updated);

    const result = await rebootGpuNode("gpu-1");

    expect(mockApiFetch).toHaveBeenCalledWith("/admin/gpu/gpu-1/reboot", { method: "POST" });
    expect(result).toEqual(updated);
  });

  it("throws when reboot fails", async () => {
    mockApiFetch.mockRejectedValue(new Error("Reboot failed"));
    await expect(rebootGpuNode("gpu-1")).rejects.toThrow("Reboot failed");
  });
});

describe("listGpuRegions", () => {
  it("calls /admin/gpu/regions", async () => {
    const regions = [fakeRegion()];
    mockApiFetch.mockResolvedValue(regions);

    const result = await listGpuRegions();

    expect(mockApiFetch).toHaveBeenCalledWith("/admin/gpu/regions");
    expect(result).toEqual(regions);
  });

  it("throws when API fails", async () => {
    mockApiFetch.mockRejectedValue(new Error("fail"));
    await expect(listGpuRegions()).rejects.toThrow("fail");
  });
});

describe("listGpuSizes", () => {
  it("calls /admin/gpu/sizes", async () => {
    const sizes = [fakeSize()];
    mockApiFetch.mockResolvedValue(sizes);

    const result = await listGpuSizes();

    expect(mockApiFetch).toHaveBeenCalledWith("/admin/gpu/sizes");
    expect(result).toEqual(sizes);
  });

  it("throws when API fails", async () => {
    mockApiFetch.mockRejectedValue(new Error("fail"));
    await expect(listGpuSizes()).rejects.toThrow("fail");
  });
});
