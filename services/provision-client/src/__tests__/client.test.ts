import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkHealth, deprovisionContainer, provisionContainer, updateBudget } from "../client.js";

describe("provision-client", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("provisionContainer", () => {
    it("sends provision request and returns response", async () => {
      const mockResponse = {
        tenantEntityId: "t-1",
        tenantSlug: "ACM",
        adminUserId: "user-1",
        agents: [{ id: "a1", name: "CEO", role: "ceo" }],
      };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await provisionContainer("http://10.0.0.5:3100", "secret", {
        tenantId: "t1",
        tenantName: "Acme",
        gatewayUrl: "https://gw.test/v1",
        apiKey: "sk-test",
        budgetCents: 10000,
        adminUser: { id: "user-1", email: "a@acme.com", name: "Admin" },
      });

      expect(result.tenantEntityId).toBe("t-1");
      expect(result.agents).toHaveLength(1);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://10.0.0.5:3100/internal/provision",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("throws on error", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        text: () => Promise.resolve("Missing fields"),
      });

      await expect(
        provisionContainer("http://10.0.0.5:3100", "secret", {
          tenantId: "t1",
          tenantName: "Test",
          gatewayUrl: "https://gw.test/v1",
          apiKey: "sk",
          budgetCents: 0,
          adminUser: { id: "u1", email: "a@test.com", name: "A" },
        }),
      ).rejects.toThrow("Provision failed (422)");
    });
  });

  describe("updateBudget", () => {
    it("calls budget endpoint", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

      await updateBudget("http://10.0.0.5:3100", "secret", "t-1", 50000);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://10.0.0.5:3100/internal/provision/budget",
        expect.objectContaining({ method: "PUT" }),
      );
    });
  });

  describe("deprovisionContainer", () => {
    it("calls teardown endpoint", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

      await deprovisionContainer("http://10.0.0.5:3100", "secret", "t-1");

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://10.0.0.5:3100/internal/provision",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  describe("checkHealth", () => {
    it("returns true for healthy container", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true, provisioning: true }),
      });
      expect(await checkHealth("http://10.0.0.5:3100")).toBe(true);
    });

    it("returns false on network error", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
      expect(await checkHealth("http://10.0.0.5:3100")).toBe(false);
    });

    it("returns false when provisioning disabled", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true, provisioning: false }),
      });
      expect(await checkHealth("http://10.0.0.5:3100")).toBe(false);
    });
  });
});
