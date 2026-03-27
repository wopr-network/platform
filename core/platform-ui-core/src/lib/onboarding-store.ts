/**
 * Client-side onboarding state with localStorage persistence.
 * Enables resume from last completed step.
 */
import { PROVIDER_DOC_URLS } from "../config/provider-docs";
import { storageKey } from "./brand-config";

export interface ProviderConfig {
  id: string;
  name: string;
  key: string;
  validated: boolean;
}

/** Persisted shape — intentionally excludes `key` and `channelConfigs` to prevent secrets from reaching localStorage. */
interface PersistedProviderConfig {
  id: string;
  name: string;
  validated: boolean;
}

interface PersistedOnboardingState {
  currentStep: number;
  providers: PersistedProviderConfig[];
  channels: string[];
  channelsConfigured: string[];
  plugins: string[];
  instanceName: string;
}

export interface OnboardingState {
  currentStep: number;
  providers: ProviderConfig[];
  channels: string[];
  channelsConfigured: string[];
  channelConfigs: Record<string, Record<string, string>>;
  plugins: string[];
  instanceName: string;
}

const STORAGE_KEY = storageKey("onboarding");

const defaultState: OnboardingState = {
  currentStep: 0,
  providers: [],
  channels: [],
  channelsConfigured: [],
  channelConfigs: {},
  plugins: ["memory"],
  instanceName: "",
};

export function loadOnboardingState(): OnboardingState {
  if (typeof window === "undefined") return { ...defaultState };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const persisted = JSON.parse(raw) as Partial<PersistedOnboardingState>;
      return {
        ...defaultState,
        currentStep: persisted.currentStep ?? defaultState.currentStep,
        providers: (persisted.providers ?? []).map((p) => ({
          ...p,
          key: "",
          validated: p.validated ?? false,
        })),
        channels: persisted.channels ?? defaultState.channels,
        channelsConfigured: persisted.channelsConfigured ?? defaultState.channelsConfigured,
        channelConfigs: {},
        plugins: persisted.plugins ?? defaultState.plugins,
        instanceName: persisted.instanceName ?? defaultState.instanceName,
      };
    }
  } catch {
    // ignore
  }
  return { ...defaultState };
}

/** Build a persisted snapshot that never includes API keys or channel secrets. */
function toPersistedState(state: OnboardingState): PersistedOnboardingState {
  return {
    currentStep: state.currentStep,
    providers: state.providers.map(({ id, name }) => ({ id, name, validated: false })),
    channels: state.channels,
    channelsConfigured: state.channelsConfigured,
    plugins: state.plugins,
    instanceName: state.instanceName,
  };
}

export function saveOnboardingState(state: OnboardingState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersistedState(state)));
  } catch {
    // ignore
  }
}

export function clearOnboardingState(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore — storage may be blocked in private browsing
  }
}

const COMPLETE_KEY = storageKey("onboarding-complete");

export function isOnboardingComplete(): boolean {
  if (typeof window === "undefined") return true; // SSR: never gate
  try {
    return localStorage.getItem(COMPLETE_KEY) === "1";
  } catch {
    // Fail open — don't block dashboard access if storage is unavailable
    return true;
  }
}

export function markOnboardingComplete(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(COMPLETE_KEY, "1");
  } catch {
    // ignore — storage may be blocked in private browsing
  }
}

export const AI_PROVIDERS = [
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Claude models for advanced reasoning",
    models: "Claude Opus, Sonnet, Haiku",
    color: "#D4A574",
    recommended: true,
    keyPattern: "^sk-ant-[a-zA-Z0-9_-]+$",
    keyPlaceholder: "sk-ant-api03-...",
    keyHelpUrl: PROVIDER_DOC_URLS.anthropic,
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "GPT and Codex models",
    models: "GPT-4o, GPT-4, o1, o3",
    color: "#10A37F",
    recommended: false,
    keyPattern: "^sk-[a-zA-Z0-9_-]+$",
    keyPlaceholder: "sk-proj-...",
    keyHelpUrl: PROVIDER_DOC_URLS.openai,
  },
  {
    id: "google",
    name: "Google",
    description: "Gemini models for multimodal AI",
    models: "Gemini 2.5 Pro, Flash",
    color: "#4285F4",
    recommended: false,
    keyPattern: "^AIza[a-zA-Z0-9_-]+$",
    keyPlaceholder: "AIzaSy...",
    keyHelpUrl: PROVIDER_DOC_URLS.google,
  },
  {
    id: "xai",
    name: "xAI",
    description: "Grok models for real-time knowledge",
    models: "Grok-2, Grok-3",
    color: "#000000",
    recommended: false,
    keyPattern: "^xai-[a-zA-Z0-9_-]+$",
    keyPlaceholder: "xai-...",
    keyHelpUrl: PROVIDER_DOC_URLS.xai,
  },
  {
    id: "local",
    name: "Local",
    description: "Ollama, LM Studio, or other local models",
    models: "Llama, Mistral, Phi, etc.",
    color: "#6B7280",
    recommended: false,
    keyPattern: ".*",
    keyPlaceholder: "http://localhost:11434",
    keyHelpUrl: PROVIDER_DOC_URLS.local,
  },
] as const;

export type AIProviderId = (typeof AI_PROVIDERS)[number]["id"];

export const ENHANCEMENT_PLUGINS = [
  {
    id: "memory",
    name: "Memory",
    description: "Remember conversations with semantic search",
    recommended: true,
    requiresKey: false,
  },
  {
    id: "web-search",
    name: "Web Search",
    description: "Search the web for real-time information",
    recommended: false,
    requiresKey: true,
  },
  {
    id: "image-gen",
    name: "Image Generation",
    description: "Create images from text descriptions",
    recommended: false,
    requiresKey: true,
  },
  {
    id: "voice",
    name: "Voice",
    description: "Speech-to-text and text-to-speech",
    recommended: false,
    requiresKey: false,
  },
  {
    id: "github",
    name: "GitHub",
    description: "Interact with repositories and issues",
    recommended: false,
    requiresKey: true,
  },
  {
    id: "browser",
    name: "Browser",
    description: "Navigate and interact with web pages",
    recommended: false,
    requiresKey: false,
  },
] as const;
