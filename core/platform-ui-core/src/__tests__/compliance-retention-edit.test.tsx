import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";

// Mock apiFetch
const mockApiFetch = vi.fn();
vi.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  fetchAuditLog: vi.fn(),
}));
vi.mock("@/lib/trpc", () => ({
  trpcVanilla: {
    admin: {
      complianceDeletionRequests: { query: vi.fn().mockResolvedValue({ requests: [], total: 0 }) },
      complianceTriggerDeletion: { mutate: vi.fn() },
      complianceExportRequests: { query: vi.fn().mockResolvedValue({ requests: [], total: 0 }) },
      complianceTriggerExport: { mutate: vi.fn() },
      complianceCancelDeletion: { mutate: vi.fn() },
    },
  },
}));

// Mock fetchRetentionPolicies and updateRetentionPolicy for component tests
const mockFetchRetentionPolicies = vi.fn();
const mockUpdateRetentionPolicy = vi.fn();

vi.mock("@/lib/admin-compliance-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/admin-compliance-api")>(
    "@/lib/admin-compliance-api",
  );
  return {
    ...actual,
    fetchRetentionPolicies: (...args: unknown[]) => mockFetchRetentionPolicies(...args),
    updateRetentionPolicy: (...args: unknown[]) => mockUpdateRetentionPolicy(...args),
  };
});

vi.mock("@/lib/errors", () => ({
  toUserMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { ComplianceDashboard } from "@/components/admin/compliance-dashboard";

const MOCK_POLICIES = [
  {
    dataType: "audit_logs",
    retentionDays: 365,
    autoDelete: false,
    lastPurge: null,
    recordsAffected: 1200,
  },
];

describe("updateRetentionPolicy", () => {
  it("calls PATCH /admin/compliance/retention/:dataType with body", async () => {
    // Test the underlying apiFetch directly via the real implementation
    mockApiFetch.mockResolvedValueOnce({
      dataType: "audit_logs",
      retentionDays: 180,
      autoDelete: true,
      lastPurge: null,
      recordsAffected: 0,
    });

    const { updateRetentionPolicy } = await vi.importActual<
      typeof import("@/lib/admin-compliance-api")
    >("@/lib/admin-compliance-api");

    const result2 = await updateRetentionPolicy("audit_logs", {
      retentionDays: 180,
      autoDelete: true,
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/admin/compliance/retention/audit_logs",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ retentionDays: 180, autoDelete: true }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(result2.retentionDays).toBe(180);
  });
});

describe("RetentionPoliciesTab edit", () => {
  it("shows Edit button on each policy card", async () => {
    mockFetchRetentionPolicies.mockResolvedValueOnce(MOCK_POLICIES);
    render(<ComplianceDashboard />);

    const retentionTab = await screen.findByRole("tab", { name: /retention/i });
    await userEvent.click(retentionTab);

    const editBtn = await screen.findByRole("button", { name: /edit/i });
    expect(editBtn).toBeInTheDocument();
  });

  it("opens dialog with current values and saves", async () => {
    mockFetchRetentionPolicies.mockResolvedValueOnce(MOCK_POLICIES);
    mockUpdateRetentionPolicy.mockResolvedValueOnce({
      ...MOCK_POLICIES[0],
      retentionDays: 180,
    });

    render(<ComplianceDashboard />);

    const retentionTab = await screen.findByRole("tab", { name: /retention/i });
    await userEvent.click(retentionTab);

    const editBtn = await screen.findByRole("button", { name: /edit/i });
    await userEvent.click(editBtn);

    const daysInput = await screen.findByLabelText(/retention.*days/i);
    expect(daysInput).toHaveValue(365);

    await userEvent.clear(daysInput);
    await userEvent.type(daysInput, "180");

    const saveBtn = screen.getByRole("button", { name: /save/i });
    await userEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdateRetentionPolicy).toHaveBeenCalledWith("audit_logs", {
        retentionDays: 180,
        autoDelete: false,
      });
    });
  });
});
