import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProxyManager } from "./manager.js";

/**
 * ProxyManager unit tests.
 *
 * Per-instance subdomain routing was retired — the manager now only owns the
 * static Caddy product config (root → UI, api → core, *.domain → core).
 * Tests cover lifecycle (start/stop) and reload (Caddy admin API).
 */
describe("ProxyManager", () => {
  let manager: ProxyManager;

  beforeEach(() => {
    manager = new ProxyManager({
      caddyAdminUrl: "http://localhost:2019",
      cloudflareApiToken: "test-cf-token",
      products: [{ slug: "testapp", domain: "testapp.dev", uiUpstream: "testapp-ui:3002", apiUpstream: "core:3001" }],
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve("") }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("lifecycle", () => {
    it("starts and sets running state", async () => {
      expect(manager.isRunning).toBe(false);
      await manager.start();
      expect(manager.isRunning).toBe(true);
    });

    it("stops and clears running state", async () => {
      await manager.start();
      await manager.stop();
      expect(manager.isRunning).toBe(false);
    });
  });

  describe("reload", () => {
    it("skips reload when not running", async () => {
      await manager.reload();
      expect(fetch).not.toHaveBeenCalled();
    });

    it("sends config to Caddy on reload", async () => {
      await manager.start();
      vi.mocked(fetch).mockClear();

      await manager.reload();

      expect(fetch).toHaveBeenCalledTimes(1);
      const callArgs = vi.mocked(fetch).mock.calls[0];
      expect(callArgs[0]).toBe("http://localhost:2019/load");

      const body = JSON.parse(callArgs[1]?.body as string);
      expect(body.apps.http.servers.srv0.routes.length).toBeGreaterThan(0);
    });

    it("throws on Caddy API failure", async () => {
      await manager.start();
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal Server Error"),
      } as Response);

      await expect(manager.reload()).rejects.toThrow("Caddy reload failed (500)");
    });
  });
});
