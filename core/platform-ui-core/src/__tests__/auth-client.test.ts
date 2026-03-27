import { beforeEach, describe, expect, it, vi } from "vitest";

const mockTwoFactorPlugin = { id: "two-factor" };

vi.mock("better-auth/client/plugins", () => ({
  twoFactorClient: vi.fn(() => mockTwoFactorPlugin),
}));

vi.mock("@/lib/api-config", () => ({
  PLATFORM_BASE_URL: "https://test-api.local",
}));

const mockAuthClient = {
  useSession: vi.fn(),
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  linkSocial: vi.fn(),
  unlinkAccount: vi.fn(),
  listAccounts: vi.fn(),
  $fetch: vi.fn(),
};

vi.mock("better-auth/react", () => ({
  createAuthClient: vi.fn(() => mockAuthClient),
}));

describe("auth-client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls createAuthClient with PLATFORM_BASE_URL", async () => {
    const { createAuthClient } = await import("better-auth/react");
    await import("@/lib/auth-client");

    expect(createAuthClient).toHaveBeenCalledWith({
      baseURL: "https://test-api.local",
      plugins: [mockTwoFactorPlugin],
    });
  });

  it("authClient is the instance returned by createAuthClient", async () => {
    const mod = await import("@/lib/auth-client");
    expect(mod.authClient).toBe(mockAuthClient);
  });

  it("exports authClient object", async () => {
    const mod = await import("@/lib/auth-client");
    expect(mod.authClient).toBe(mockAuthClient);
  });

  it("exports useSession from authClient", async () => {
    const mod = await import("@/lib/auth-client");
    expect(mod.useSession).toBe(mockAuthClient.useSession);
  });

  it("exports signIn from authClient", async () => {
    const mod = await import("@/lib/auth-client");
    expect(mod.signIn).toBe(mockAuthClient.signIn);
  });

  it("exports signUp from authClient", async () => {
    const mod = await import("@/lib/auth-client");
    expect(mod.signUp).toBe(mockAuthClient.signUp);
  });

  it("exports signOut from authClient", async () => {
    const mod = await import("@/lib/auth-client");
    expect(mod.signOut).toBe(mockAuthClient.signOut);
  });

  it("exports linkSocial from authClient", async () => {
    const mod = await import("@/lib/auth-client");
    expect(mod.linkSocial).toBe(mockAuthClient.linkSocial);
  });

  it("exports unlinkAccount from authClient", async () => {
    const mod = await import("@/lib/auth-client");
    expect(mod.unlinkAccount).toBe(mockAuthClient.unlinkAccount);
  });

  it("exports listAccounts from authClient", async () => {
    const mod = await import("@/lib/auth-client");
    expect(mod.listAccounts).toBe(mockAuthClient.listAccounts);
  });
});
