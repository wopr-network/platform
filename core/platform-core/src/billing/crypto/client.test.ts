import { afterEach, describe, expect, it, vi } from "vitest";
import { CryptoServiceClient, loadCryptoConfig } from "./client.js";

describe("CryptoServiceClient", () => {
  afterEach(() => vi.restoreAllMocks());

  it("deriveAddress sends POST /address with chain", async () => {
    const mockResponse = { address: "bc1q...", index: 42, chain: "bitcoin", token: "BTC" };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(mockResponse), { status: 201 }));

    const client = new CryptoServiceClient({ baseUrl: "http://localhost:3100" });
    const result = await client.deriveAddress("btc");

    expect(result.address).toBe("bc1q...");
    expect(result.index).toBe(42);

    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("http://localhost:3100/address");
    expect(opts?.method).toBe("POST");
    expect(JSON.parse(opts?.body as string)).toEqual({ chain: "btc" });
  });

  it("createCharge sends POST /charges", async () => {
    const mockResponse = {
      chargeId: "btc:bc1q...",
      address: "bc1q...",
      chain: "btc",
      token: "BTC",
      amountUsd: 50,
      derivationIndex: 42,
      expiresAt: "2026-03-20T04:00:00Z",
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(mockResponse), { status: 201 }));

    const client = new CryptoServiceClient({
      baseUrl: "http://localhost:3100",
      serviceKey: "sk-test",
      tenantId: "tenant-1",
    });
    const result = await client.createCharge({ chain: "btc", amountUsd: 50 });

    expect(result.chargeId).toBe("btc:bc1q...");
    expect(result.address).toBe("bc1q...");

    const [, opts] = vi.mocked(fetch).mock.calls[0];
    const headers = opts?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-test");
    expect(headers["X-Tenant-Id"]).toBe("tenant-1");
  });

  it("getCharge sends GET /charges/:id", async () => {
    const mockResponse = { chargeId: "btc:bc1q...", status: "confirmed" };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(mockResponse), { status: 200 }));

    const client = new CryptoServiceClient({ baseUrl: "http://localhost:3100" });
    const result = await client.getCharge("btc:bc1q...");

    expect(result.status).toBe("confirmed");
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("http://localhost:3100/charges/btc%3Abc1q...");
  });

  it("listChains sends GET /chains", async () => {
    const mockResponse = [{ id: "btc", token: "BTC", chain: "bitcoin", decimals: 8, isTestnet: false }];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(mockResponse), { status: 200 }));

    const client = new CryptoServiceClient({ baseUrl: "http://localhost:3100" });
    const result = await client.listChains();

    expect(result).toHaveLength(1);
    expect(result[0].token).toBe("BTC");
    expect(result[0].isTestnet).toBe(false);
  });

  it("listChains fails closed on missing isTestnet — coerces undefined to true so staggered deploys don't leak testnet chains", async () => {
    // Pre-migration 0005 crypto-server responses omit isTestnet entirely.
    // The client must treat that as "unknown, assume testnet" so downstream
    // policy filters never accidentally allow a testnet chain through.
    const mockResponse = [
      { id: "ton:ton-testnet", token: "TON", chain: "ton-testnet", decimals: 9 },
      { id: "ton:ton", token: "TON", chain: "ton", decimals: 9, isTestnet: false },
    ];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(mockResponse), { status: 200 }));

    const client = new CryptoServiceClient({ baseUrl: "http://localhost:3100" });
    const result = await client.listChains();

    expect(result[0].isTestnet).toBe(true); // undefined → true (fail closed)
    expect(result[1].isTestnet).toBe(false); // explicitly false → false
  });

  it("throws on non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Not found", { status: 404 }));

    const client = new CryptoServiceClient({ baseUrl: "http://localhost:3100" });
    await expect(client.getCharge("missing")).rejects.toThrow("CryptoService getCharge failed (404)");
  });
});

describe("loadCryptoConfig", () => {
  it("returns config when baseUrl is provided", () => {
    expect(
      loadCryptoConfig({
        baseUrl: "http://10.120.0.5:3100",
        serviceKey: "sk-test",
        tenantId: "tenant-1",
      }),
    ).toEqual({
      baseUrl: "http://10.120.0.5:3100",
      serviceKey: "sk-test",
      tenantId: "tenant-1",
    });
  });

  it("returns null when baseUrl is missing", () => {
    expect(loadCryptoConfig({})).toBeNull();
  });

  it("returns null when baseUrl is null", () => {
    expect(loadCryptoConfig({ baseUrl: null })).toBeNull();
  });
});
