import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/org-api", () => ({
  getOrganization: vi.fn(),
}));

import { useHasOrg } from "@/hooks/use-has-org";
import { getOrganization } from "@/lib/org-api";

describe("useHasOrg", () => {
  it("returns hasOrg=true when getOrganization succeeds", async () => {
    vi.mocked(getOrganization).mockResolvedValue({
      id: "org-1",
      name: "Test Org",
      slug: "test-org",
      billingEmail: "test@example.com",
      members: [],
      invites: [],
    });

    const { result } = renderHook(() => useHasOrg());

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.hasOrg).toBe(true);
  });

  it("returns hasOrg=false when getOrganization throws", async () => {
    vi.mocked(getOrganization).mockRejectedValue(new Error("Not found"));

    const { result } = renderHook(() => useHasOrg());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.hasOrg).toBe(false);
  });
});
