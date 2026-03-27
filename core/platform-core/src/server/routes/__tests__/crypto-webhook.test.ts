import { describe, expect, it, vi } from "vitest";
import type { CryptoServices } from "../../container.js";
import { createTestContainer } from "../../test-container.js";
import { type CryptoWebhookConfig, createCryptoWebhookRoutes } from "../crypto-webhook.js";

// ---------------------------------------------------------------------------
// Mock the key-server-webhook handler so we never hit real billing logic
// ---------------------------------------------------------------------------

vi.mock("../../../billing/crypto/key-server-webhook.js", () => ({
  handleKeyServerWebhook: vi.fn().mockResolvedValue({
    handled: true,
    creditedCents: 500,
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SECRET = "test-provision-secret";
const CRYPTO_KEY = "test-crypto-service-key";

function makeConfig(overrides?: Partial<CryptoWebhookConfig>): CryptoWebhookConfig {
  return {
    provisionSecret: SECRET,
    cryptoServiceKey: CRYPTO_KEY,
    ...overrides,
  };
}

function makeCrypto(): CryptoServices {
  return {
    chargeRepo: {} as never,
    webhookSeenRepo: {} as never,
  };
}

const validPayload = {
  chargeId: "ch_123",
  chain: "ETH",
  address: "0xabc",
  status: "confirmed",
};

function buildApp(opts?: { crypto?: CryptoServices | null; config?: Partial<CryptoWebhookConfig> }) {
  const container = createTestContainer({
    crypto: opts?.crypto !== undefined ? opts.crypto : makeCrypto(),
  });
  const config = makeConfig(opts?.config);
  return createCryptoWebhookRoutes(container, config);
}

async function post(app: ReturnType<typeof buildApp>, body: unknown, headers?: Record<string, string>) {
  const init: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  };

  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
  }

  return app.request("/", init);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createCryptoWebhookRoutes", () => {
  // 1. No auth header
  it("returns 401 without auth header", async () => {
    const app = buildApp();
    const res = await post(app, validPayload);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  // 2. Wrong Bearer token
  it("returns 401 with wrong Bearer token", async () => {
    const app = buildApp();
    const res = await post(app, validPayload, {
      Authorization: "Bearer wrong-token",
    });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  // 3. Invalid JSON
  it("returns 400 on invalid JSON", async () => {
    const app = buildApp();
    const res = await app.request("/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SECRET}`,
      },
      body: "not-valid-json{{{",
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid JSON");
  });

  // 4. Zod validation failure (missing required fields)
  it("returns 400 on payload that fails Zod validation", async () => {
    const app = buildApp();
    const res = await post(
      app,
      { chargeId: "ch_123" }, // missing chain, address, status
      { Authorization: `Bearer ${SECRET}` },
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid payload");
    expect(json.issues).toBeDefined();
    expect(json.issues.length).toBeGreaterThan(0);
  });

  // 5. Container crypto is null -> 501
  it("returns 501 when container.crypto is null", async () => {
    const app = buildApp({ crypto: null });
    const res = await post(app, validPayload, {
      Authorization: `Bearer ${SECRET}`,
    });

    expect(res.status).toBe(501);
    const json = await res.json();
    expect(json.error).toBe("Crypto payments not configured");
  });

  // 6. Valid Bearer matching provision secret
  it("accepts valid Bearer token matching provision secret", async () => {
    const app = buildApp();
    const res = await post(app, validPayload, {
      Authorization: `Bearer ${SECRET}`,
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.handled).toBe(true);
    expect(json.creditedCents).toBe(500);
  });

  // 7. Valid Bearer matching crypto service key
  it("accepts valid Bearer token matching crypto service key", async () => {
    const app = buildApp();
    const res = await post(app, validPayload, {
      Authorization: `Bearer ${CRYPTO_KEY}`,
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.handled).toBe(true);
    expect(json.creditedCents).toBe(500);
  });
});
