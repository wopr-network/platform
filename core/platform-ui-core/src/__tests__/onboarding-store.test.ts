import { beforeEach, describe, expect, it } from "vitest";
import {
  clearOnboardingState,
  loadOnboardingState,
  type OnboardingState,
  saveOnboardingState,
} from "../lib/onboarding-store";

beforeEach(() => {
  localStorage.clear();
});

describe("saveOnboardingState", () => {
  it("persists state to localStorage with secrets stripped", () => {
    const state: OnboardingState = {
      currentStep: 2,
      providers: [{ id: "anthropic", name: "Anthropic", key: "sk-ant-xxx", validated: true }],
      channels: ["discord"],
      channelsConfigured: ["discord"],
      channelConfigs: { discord: { token: "abc" } },
      plugins: ["memory", "voice"],
      instanceName: "test-bot",
    };
    saveOnboardingState(state);
    const raw = localStorage.getItem("platform-onboarding");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw ?? "null");
    expect(parsed.currentStep).toBe(2);
    expect(parsed.instanceName).toBe("test-bot");
    expect(parsed.channels).toEqual(["discord"]);
    expect(parsed.providers[0].key).toBeUndefined();
    expect(parsed.providers[0].validated).toBe(false);
    expect((parsed as Record<string, unknown>).channelConfigs).toBeUndefined();
  });

  it("strips provider API keys before persisting", () => {
    const state: OnboardingState = {
      currentStep: 2,
      providers: [
        { id: "anthropic", name: "Anthropic", key: "sk-ant-secret", validated: true },
        { id: "openai", name: "OpenAI", key: "sk-proj-secret", validated: true },
      ],
      channels: ["discord"],
      channelsConfigured: ["discord"],
      channelConfigs: { discord: { token: "discord-bot-token" } },
      plugins: ["memory"],
      instanceName: "test-bot",
    };
    saveOnboardingState(state);
    const raw = JSON.parse(localStorage.getItem("platform-onboarding") ?? "{}");
    for (const p of raw.providers) {
      expect(p.key).toBeUndefined();
      expect(p.validated).toBe(false);
    }
    expect((raw as Record<string, unknown>).channelConfigs).toBeUndefined();
  });

  it("does not mutate the original state object", () => {
    const state: OnboardingState = {
      currentStep: 1,
      providers: [{ id: "anthropic", name: "Anthropic", key: "sk-ant-xxx", validated: true }],
      channels: [],
      channelsConfigured: [],
      channelConfigs: { discord: { token: "abc" } },
      plugins: ["memory"],
      instanceName: "",
    };
    saveOnboardingState(state);
    expect(state.providers[0].key).toBe("sk-ant-xxx");
    expect(state.providers[0].validated).toBe(true);
    expect(state.channelConfigs.discord.token).toBe("abc");
  });

  it("round-trips non-secret fields correctly after stripping", () => {
    const state: OnboardingState = {
      currentStep: 3,
      providers: [{ id: "anthropic", name: "Anthropic", key: "sk-ant-xxx", validated: true }],
      channels: ["discord", "slack"],
      channelsConfigured: ["discord"],
      channelConfigs: { discord: { token: "secret" } },
      plugins: ["memory", "voice"],
      instanceName: "my-bot",
    };
    saveOnboardingState(state);
    const loaded = loadOnboardingState();
    expect(loaded.currentStep).toBe(3);
    expect(loaded.channels).toEqual(["discord", "slack"]);
    expect(loaded.instanceName).toBe("my-bot");
    expect(loaded.plugins).toEqual(["memory", "voice"]);
    expect(loaded.providers[0].id).toBe("anthropic");
    expect(loaded.providers[0].name).toBe("Anthropic");
    expect(loaded.providers[0].key).toBe("");
    expect(loaded.providers[0].validated).toBe(false);
  });
});

describe("loadOnboardingState", () => {
  it("returns default state when nothing persisted", () => {
    const state = loadOnboardingState();
    expect(state.currentStep).toBe(0);
    expect(state.providers).toEqual([]);
    expect(state.plugins).toEqual(["memory"]);
  });
});

describe("clearOnboardingState", () => {
  it("removes persisted state", () => {
    const state: OnboardingState = {
      currentStep: 1,
      providers: [],
      channels: [],
      channelsConfigured: [],
      channelConfigs: {},
      plugins: [],
      instanceName: "bot",
    };
    saveOnboardingState(state);
    clearOnboardingState();
    expect(localStorage.getItem("platform-onboarding")).toBeNull();
  });
});
