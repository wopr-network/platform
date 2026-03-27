import { afterEach, describe, expect, it, vi } from "vitest";

const {
  mockNotificationPreferencesQuery,
  mockUpdateNotificationPreferencesMutate,
  mockStoreKeyMutate,
  mockTestKeyMutate,
  mockListCapabilitySettingsQuery,
  mockUpdateCapabilitySettingsMutate,
  mockListCapabilityMetaQuery,
} = vi.hoisted(() => ({
  mockNotificationPreferencesQuery: vi.fn(),
  mockUpdateNotificationPreferencesMutate: vi.fn(),
  mockStoreKeyMutate: vi.fn(),
  mockTestKeyMutate: vi.fn(),
  mockListCapabilitySettingsQuery: vi.fn(),
  mockUpdateCapabilitySettingsMutate: vi.fn(),
  mockListCapabilityMetaQuery: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpcVanilla: {
    settings: {
      notificationPreferences: { query: mockNotificationPreferencesQuery },
      updateNotificationPreferences: { mutate: mockUpdateNotificationPreferencesMutate },
    },
    capabilities: {
      storeKey: { mutate: mockStoreKeyMutate },
      testKey: { mutate: mockTestKeyMutate },
      listCapabilitySettings: { query: mockListCapabilitySettingsQuery },
      updateCapabilitySettings: { mutate: mockUpdateCapabilitySettingsMutate },
      listCapabilityMeta: { query: mockListCapabilityMetaQuery },
    },
  },
  trpc: {},
}));

vi.mock("@/lib/fetch-utils", () => ({
  handleUnauthorized: vi.fn(() => {
    throw new Error("Unauthorized");
  }),
  UnauthorizedError: class extends Error {},
}));

vi.mock("@/lib/api-config", () => ({
  API_BASE_URL: "http://test-api:3001/api",
  PLATFORM_BASE_URL: "http://test-api:3001",
}));

vi.mock("@/lib/tenant-context", () => ({
  getActiveTenantId: vi.fn(() => "tenant-123"),
}));

import {
  fetchCapabilityMeta,
  getNotificationPreferences,
  listCapabilities,
  saveProviderKey,
  testProviderKey,
  updateCapability,
  updateNotificationPreferences,
} from "@/lib/settings-api";

describe("getNotificationPreferences", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns preferences from tRPC query", async () => {
    const prefs = {
      billing_low_balance: true,
      billing_receipts: false,
      billing_auto_topup: true,
      agent_channel_disconnect: false,
      agent_status_changes: true,
      account_role_changes: false,
      account_team_invites: true,
    };
    mockNotificationPreferencesQuery.mockResolvedValue(prefs);

    const result = await getNotificationPreferences();
    expect(result).toEqual(prefs);
    expect(mockNotificationPreferencesQuery).toHaveBeenCalledWith(undefined);
  });

  it("propagates tRPC errors", async () => {
    mockNotificationPreferencesQuery.mockRejectedValue(new Error("Network error"));
    await expect(getNotificationPreferences()).rejects.toThrow("Network error");
  });
});

describe("updateNotificationPreferences", () => {
  afterEach(() => vi.clearAllMocks());

  it("sends partial prefs and returns updated result", async () => {
    const updated = {
      billing_low_balance: false,
      billing_receipts: true,
      billing_auto_topup: false,
      agent_channel_disconnect: false,
      agent_status_changes: false,
      account_role_changes: false,
      account_team_invites: false,
    };
    mockUpdateNotificationPreferencesMutate.mockResolvedValue(updated);

    const result = await updateNotificationPreferences({ billing_low_balance: false });
    expect(result).toEqual(updated);
    expect(mockUpdateNotificationPreferencesMutate).toHaveBeenCalledWith({
      billing_low_balance: false,
    });
  });

  it("propagates tRPC errors", async () => {
    mockUpdateNotificationPreferencesMutate.mockRejectedValue(new Error("Forbidden"));
    await expect(updateNotificationPreferences({ billing_receipts: true })).rejects.toThrow(
      "Forbidden",
    );
  });
});

describe("saveProviderKey", () => {
  afterEach(() => vi.clearAllMocks());

  it("calls storeKey with provider and apiKey", async () => {
    const response = { ok: true as const, id: "key-1", provider: "openai" };
    mockStoreKeyMutate.mockResolvedValue(response);

    const result = await saveProviderKey("openai", "sk-test-123");
    expect(result).toEqual(response);
    expect(mockStoreKeyMutate).toHaveBeenCalledWith({
      provider: "openai",
      apiKey: "sk-test-123",
    });
  });

  it("propagates tRPC errors", async () => {
    mockStoreKeyMutate.mockRejectedValue(new Error("Invalid key"));
    await expect(saveProviderKey("openai", "bad")).rejects.toThrow("Invalid key");
  });
});

describe("testProviderKey", () => {
  afterEach(() => vi.clearAllMocks());

  it("calls testKey with provider and key", async () => {
    mockTestKeyMutate.mockResolvedValue({ valid: true });

    const result = await testProviderKey("anthropic", "sk-ant-123");
    expect(result).toEqual({ valid: true });
    expect(mockTestKeyMutate).toHaveBeenCalledWith({
      provider: "anthropic",
      key: "sk-ant-123",
    });
  });

  it("defaults key to empty string when not provided", async () => {
    mockTestKeyMutate.mockResolvedValue({ valid: false, error: "No key" });

    const result = await testProviderKey("openai");
    expect(result).toEqual({ valid: false, error: "No key" });
    expect(mockTestKeyMutate).toHaveBeenCalledWith({
      provider: "openai",
      key: "",
    });
  });

  it("propagates tRPC errors", async () => {
    mockTestKeyMutate.mockRejectedValue(new Error("Timeout"));
    await expect(testProviderKey("openai", "k")).rejects.toThrow("Timeout");
  });
});

describe("listCapabilities", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns capability settings array", async () => {
    const caps = [
      {
        capability: "transcription",
        mode: "hosted",
        maskedKey: null,
        keyStatus: null,
        provider: "deepgram",
      },
    ];
    mockListCapabilitySettingsQuery.mockResolvedValue(caps);

    const result = await listCapabilities();
    expect(result).toEqual(caps);
    expect(mockListCapabilitySettingsQuery).toHaveBeenCalledWith(undefined);
  });

  it("propagates tRPC errors", async () => {
    mockListCapabilitySettingsQuery.mockRejectedValue(new Error("Server error"));
    await expect(listCapabilities()).rejects.toThrow("Server error");
  });
});

describe("updateCapability", () => {
  afterEach(() => vi.clearAllMocks());

  it("sends capability, mode, and optional key", async () => {
    const updated = {
      capability: "transcription",
      mode: "byok",
      maskedKey: "sk-***123",
      keyStatus: "valid",
      provider: "deepgram",
    };
    mockUpdateCapabilitySettingsMutate.mockResolvedValue(updated);

    const result = await updateCapability("transcription", {
      mode: "byok",
      key: "sk-full-key",
    });
    expect(result).toEqual(updated);
    expect(mockUpdateCapabilitySettingsMutate).toHaveBeenCalledWith({
      capability: "transcription",
      mode: "byok",
      key: "sk-full-key",
    });
  });

  it("sends without key when not provided", async () => {
    const updated = {
      capability: "text-gen",
      mode: "hosted",
      maskedKey: null,
      keyStatus: null,
      provider: "anthropic",
    };
    mockUpdateCapabilitySettingsMutate.mockResolvedValue(updated);

    await updateCapability("text-gen", { mode: "hosted" });
    expect(mockUpdateCapabilitySettingsMutate).toHaveBeenCalledWith({
      capability: "text-gen",
      mode: "hosted",
      key: undefined,
    });
  });

  it("propagates tRPC errors", async () => {
    mockUpdateCapabilitySettingsMutate.mockRejectedValue(new Error("Bad request"));
    await expect(updateCapability("text-gen", { mode: "hosted" })).rejects.toThrow("Bad request");
  });
});

describe("fetchCapabilityMeta", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns capability meta entries", async () => {
    const meta = [
      {
        capability: "transcription",
        label: "Transcription",
        description: "Speech to text",
        pricing: "$0.01/min",
        hostedProvider: "deepgram",
        icon: "mic",
        sortOrder: 1,
      },
    ];
    mockListCapabilityMetaQuery.mockResolvedValue(meta);

    const result = await fetchCapabilityMeta();
    expect(result).toEqual(meta);
  });

  it("propagates tRPC errors", async () => {
    mockListCapabilityMetaQuery.mockRejectedValue(new Error("Not found"));
    await expect(fetchCapabilityMeta()).rejects.toThrow("Not found");
  });
});
