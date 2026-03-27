import { afterEach, describe, expect, it, vi } from "vitest";

const mockCreateUserCreator = vi.fn();
vi.mock("./user-creator.js", () => ({
  createUserCreator: (...args: unknown[]) => mockCreateUserCreator(...args),
}));

vi.mock("../admin/role-store.js", () => ({
  RoleStore: vi.fn(),
}));

const { getUserCreator, initBetterAuth, resetUserCreator } = await import("./better-auth.js");

const fakeConfig = { pool: {}, db: {} } as Parameters<typeof initBetterAuth>[0];

describe("getUserCreator", () => {
  afterEach(() => {
    resetUserCreator();
    mockCreateUserCreator.mockReset();
  });

  it("caches the resolved creator on success", async () => {
    initBetterAuth(fakeConfig);
    const fakeCreator = { createUser: vi.fn() };
    mockCreateUserCreator.mockResolvedValueOnce(fakeCreator);

    const first = await getUserCreator();
    const second = await getUserCreator();

    expect(first).toBe(second);
    expect(mockCreateUserCreator).toHaveBeenCalledOnce();
  });

  it("clears cached promise on rejection so next call retries", async () => {
    initBetterAuth(fakeConfig);
    const fakeCreator = { createUser: vi.fn() };

    mockCreateUserCreator.mockRejectedValueOnce(new Error("DB unavailable"));
    mockCreateUserCreator.mockResolvedValueOnce(fakeCreator);

    await expect(getUserCreator()).rejects.toThrow("DB unavailable");

    const creator = await getUserCreator();
    expect(creator).toBe(fakeCreator);
    expect(mockCreateUserCreator).toHaveBeenCalledTimes(2);
  });
});
