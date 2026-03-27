import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { HTMLAttributes } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---- Mock framer-motion ----
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

// ---- Mock sonner ----
const { mockToast } = vi.hoisted(() => ({
  mockToast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: mockToast }));

// ---- Mock GPU API ----
const {
  mockListGpuNodes,
  mockListGpuRegions,
  mockListGpuSizes,
  mockRebootGpuNode,
  mockDestroyGpuNode,
  mockProvisionGpuNode,
} = vi.hoisted(() => ({
  mockListGpuNodes: vi.fn(),
  mockListGpuRegions: vi.fn(),
  mockListGpuSizes: vi.fn(),
  mockRebootGpuNode: vi.fn(),
  mockDestroyGpuNode: vi.fn(),
  mockProvisionGpuNode: vi.fn(),
}));

vi.mock("@/lib/admin-gpu-api", () => ({
  listGpuNodes: mockListGpuNodes,
  listGpuRegions: mockListGpuRegions,
  listGpuSizes: mockListGpuSizes,
  rebootGpuNode: mockRebootGpuNode,
  destroyGpuNode: mockDestroyGpuNode,
  provisionGpuNode: mockProvisionGpuNode,
}));

import { GpuDashboard } from "@/components/admin/gpu-dashboard";
import type { GpuNode } from "@/lib/admin-gpu-api";

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

afterEach(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.clearAllMocks();
  mockListGpuRegions.mockResolvedValue([{ slug: "nyc3", name: "New York 3", available: true }]);
  mockListGpuSizes.mockResolvedValue([
    {
      slug: "gpu-h100x1",
      name: "H100 x1",
      vcpus: 8,
      memoryMib: 131072,
      gpuCount: 1,
      gpuModel: "H100",
      priceMonthly: 2500,
    },
  ]);
});

describe("GpuDashboard", () => {
  it("renders heading", async () => {
    mockListGpuNodes.mockResolvedValue([]);
    render(<GpuDashboard />);
    await waitFor(() => {
      expect(screen.getByText(/GPU Management/i)).toBeInTheDocument();
    });
  });

  it("shows nodes in inventory table", async () => {
    mockListGpuNodes.mockResolvedValue([fakeNode({ name: "my-gpu" })]);
    render(<GpuDashboard />);
    await waitFor(() => {
      expect(screen.getByText("my-gpu")).toBeInTheDocument();
    });
    expect(screen.getByText("running")).toBeInTheDocument();
    expect(screen.getByText("42%")).toBeInTheDocument();
    // Temperature appears in both the KPI card and the table row
    expect(screen.getAllByText("65°C").length).toBeGreaterThan(0);
  });

  it("shows empty state when no nodes", async () => {
    mockListGpuNodes.mockResolvedValue([]);
    render(<GpuDashboard />);
    await waitFor(() => {
      expect(screen.getByText(/No GPU nodes provisioned/i)).toBeInTheDocument();
    });
  });

  it("shows error state when API fails", async () => {
    mockListGpuNodes.mockRejectedValue(new Error("API down"));
    render(<GpuDashboard />);
    await waitFor(() => {
      expect(screen.getByText("API down")).toBeInTheDocument();
    });
  });

  it("shows KPI cards with correct counts", async () => {
    mockListGpuNodes.mockResolvedValue([
      fakeNode({ id: "1", status: "running" }),
      fakeNode({ id: "2", status: "stopped" }),
    ]);
    render(<GpuDashboard />);
    await waitFor(() => {
      // Total nodes = 2, Running = 1
      expect(screen.getByText("Total Nodes")).toBeInTheDocument();
      expect(screen.getByText("Running")).toBeInTheDocument();
    });
  });

  it("shows allocation and configuration stub sections", async () => {
    mockListGpuNodes.mockResolvedValue([]);
    render(<GpuDashboard />);
    await waitFor(() => {
      expect(screen.getByText(/Allocation \/ Tenant Mapping/i)).toBeInTheDocument();
      expect(screen.getByText(/GPU Configuration/i)).toBeInTheDocument();
    });
  });

  it("calls rebootGpuNode when Reboot button is clicked", async () => {
    const node = fakeNode({ id: "gpu-99", name: "my-node" });
    mockListGpuNodes.mockResolvedValue([node]);
    mockRebootGpuNode.mockResolvedValue({ ...node, status: "rebooting" });

    render(<GpuDashboard />);
    await waitFor(() => screen.getByText("my-node"));

    const rebootBtn = screen.getAllByTitle("Reboot")[0];
    await userEvent.click(rebootBtn);

    expect(mockRebootGpuNode).toHaveBeenCalledWith("gpu-99");
    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining("Rebooting"));
    });
  });

  it("calls destroyGpuNode when Destroy is confirmed", async () => {
    const node = fakeNode({ id: "gpu-99", name: "my-node" });
    mockListGpuNodes.mockResolvedValue([node]);
    mockDestroyGpuNode.mockResolvedValue(undefined);

    render(<GpuDashboard />);
    await waitFor(() => screen.getByText("my-node"));

    const destroyBtn = screen.getAllByTitle("Destroy")[0];
    await userEvent.click(destroyBtn);

    // AlertDialog should now be open — click the confirm action
    const confirmBtn = await screen.findByRole("button", { name: "Destroy" });
    await userEvent.click(confirmBtn);

    expect(mockDestroyGpuNode).toHaveBeenCalledWith("gpu-99");
    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining("destroyed"));
    });
  });

  it("does not call destroyGpuNode when Destroy is cancelled", async () => {
    const node = fakeNode({ id: "gpu-99", name: "my-node" });
    mockListGpuNodes.mockResolvedValue([node]);

    render(<GpuDashboard />);
    await waitFor(() => screen.getByText("my-node"));

    const destroyBtn = screen.getAllByTitle("Destroy")[0];
    await userEvent.click(destroyBtn);

    // AlertDialog should now be open — click Cancel
    const cancelBtn = await screen.findByRole("button", { name: "Cancel" });
    await userEvent.click(cancelBtn);

    expect(mockDestroyGpuNode).not.toHaveBeenCalled();
  });

  it("shows provision form when Provision Node is clicked", async () => {
    mockListGpuNodes.mockResolvedValue([]);
    render(<GpuDashboard />);
    await waitFor(() => screen.getByText(/Provision Node/i));

    await userEvent.click(screen.getByText(/Provision Node/i));

    expect(screen.getByText(/Provision New GPU Node/i)).toBeInTheDocument();
  });

  it("submits provision form and adds new node", async () => {
    mockListGpuNodes.mockResolvedValue([]);
    const newNode = fakeNode({ id: "new-1", name: "fresh-gpu", status: "provisioning" });
    mockProvisionGpuNode.mockResolvedValue(newNode);

    render(<GpuDashboard />);
    await waitFor(() => screen.getByText(/Provision Node/i));

    await userEvent.click(screen.getByText(/Provision Node/i));

    const nameInput = screen.getByPlaceholderText("gpu-node-1");
    await userEvent.type(nameInput, "fresh-gpu");

    await userEvent.click(screen.getByRole("button", { name: /^Provision$/ }));

    await waitFor(() => {
      expect(mockProvisionGpuNode).toHaveBeenCalledWith(
        expect.objectContaining({ name: "fresh-gpu" }),
      );
    });
    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining("fresh-gpu"));
    });
  });
});
