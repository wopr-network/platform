import { useEffect, useMemo, useState } from "react";
import {
  additionalModels,
  allModels,
  type ByokProvider,
  byokProviders,
  channelPlugins,
  collectConfigFields,
  getChannelPlugins,
  getOptionalPlugins,
  getProviderPlugins,
  heroModels,
  MODEL_COUNT,
  type ModelOption,
  type OnboardingConfigField,
  type Personality,
  type PluginCategory,
  type PluginOption,
  type Preset,
  personalities,
  pluginCategories,
  presets,
  providerPlugins,
  resolveDependencies,
  type Superpower,
  superpowers,
  validateField,
} from "@/lib/onboarding-data";

// Re-export types so consumers only need one import source
export type {
  PluginOption,
  PluginCategory,
  Superpower,
  Personality,
  Preset,
  ModelOption,
  ByokProvider,
  OnboardingConfigField,
};

/**
 * Derived data useful for the create-instance page and other consumers
 * that need simple {value, label} lists of plugins.
 */
export interface SimpleOption {
  value: string;
  label: string;
}

export interface PluginRegistry {
  /** All channel plugins (Discord, Slack, Telegram, etc.) */
  channels: PluginOption[];
  /** All AI provider plugins (Anthropic, OpenAI, etc.) */
  providers: PluginOption[];
  /** Optional plugin categories (Memory, Voice, Integration, UI) */
  categories: PluginCategory[];
  /** Superpower definitions (ImageGen, Voice, Memory, Search) */
  superpowers: Superpower[];
  /** Personality options */
  personalities: Personality[];
  /** Preset configurations */
  presets: Preset[];
  /** Hero/featured models */
  heroModels: ModelOption[];
  /** Additional models beyond heroes */
  additionalModels: ModelOption[];
  /** All models combined */
  allModels: ModelOption[];
  /** BYOK provider options */
  byokProviders: ByokProvider[];
  /** Total model count label */
  modelCount: string;
  /** Whether marketplace channels have been loaded (or failed with fallback) */
  channelsLoaded: boolean;
  /** Whether marketplace providers have been loaded (or failed with fallback) */
  providersLoaded: boolean;
  /** Whether marketplace categories have been loaded (or failed with fallback) */
  categoriesLoaded: boolean;
  /** Whether any data source is still loading */
  loading: boolean;

  // --- Derived simple lists for create-instance and similar pages ---

  /** Providers as simple {value, label} for select dropdowns */
  providerOptions: SimpleOption[];
  /** Channels as simple {value, label} for toggle buttons */
  channelOptions: SimpleOption[];
  /** All optional plugins as simple {value, label} for toggle buttons */
  pluginOptions: SimpleOption[];

  // --- Helper functions ---

  /** Get a flat list of all plugins (channels + providers + category plugins) */
  getAllPlugins: () => PluginOption[];
  /** Find a plugin by id from the combined list */
  getPluginById: (id: string) => PluginOption | undefined;
  /** Collect config fields for a selection of channels, providers, and plugins */
  collectConfigFields: (
    selectedChannels: string[],
    selectedProviders: string[],
    selectedPlugins: string[],
  ) => OnboardingConfigField[];
  /** Resolve plugin dependencies */
  resolveDependencies: (
    selectedChannels: string[],
    selectedProviders: string[],
    selectedPlugins: string[],
  ) => string[];
  /** Validate a single config field value */
  validateField: (field: OnboardingConfigField, value: string) => string | null;
}

/**
 * Hook that provides plugin data from a single source of truth.
 *
 * Currently backed by static data in onboarding-data.ts.
 * Future: can fetch from an API and fall back to static data.
 */
export function usePluginRegistry(): PluginRegistry {
  const [channels, setChannels] = useState<PluginOption[]>([]);
  const [channelsLoaded, setChannelsLoaded] = useState(false);
  const [providers, setProviders] = useState<PluginOption[]>([]);
  const [providersLoaded, setProvidersLoaded] = useState(false);
  const [categories, setCategories] = useState<PluginCategory[]>([]);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getChannelPlugins()
      .then((result) => {
        if (!cancelled) {
          setChannels(result);
          setChannelsLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setChannels(channelPlugins);
          setChannelsLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getProviderPlugins()
      .then((result) => {
        if (!cancelled) {
          setProviders(result);
          setProvidersLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProviders(providerPlugins);
          setProvidersLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getOptionalPlugins()
      .then((result) => {
        if (!cancelled) {
          setCategories(result);
          setCategoriesLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCategories(pluginCategories);
          setCategoriesLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const providerOptions = useMemo<SimpleOption[]>(
    () => providers.map((p) => ({ value: p.id, label: p.name })),
    [providers],
  );

  const channelOptions = useMemo<SimpleOption[]>(
    () => channels.map((c) => ({ value: c.id, label: c.name })),
    [channels],
  );

  const pluginOptions = useMemo<SimpleOption[]>(
    () => categories.flatMap((cat) => cat.plugins.map((p) => ({ value: p.id, label: p.name }))),
    [categories],
  );

  const loading = !channelsLoaded || !providersLoaded || !categoriesLoaded;

  return useMemo<PluginRegistry>(
    () => ({
      channels,
      providers,
      categories,
      superpowers,
      personalities,
      presets,
      heroModels,
      additionalModels,
      allModels,
      byokProviders,
      modelCount: MODEL_COUNT,
      channelsLoaded,
      providersLoaded,
      categoriesLoaded,
      loading,
      providerOptions,
      channelOptions,
      pluginOptions,
      getAllPlugins: () => [...channels, ...providers, ...categories.flatMap((c) => c.plugins)],
      getPluginById: (id: string) =>
        [...channels, ...providers, ...categories.flatMap((c) => c.plugins)].find(
          (p) => p.id === id,
        ),
      collectConfigFields,
      resolveDependencies,
      validateField,
    }),
    [
      channels,
      channelsLoaded,
      providersLoaded,
      categoriesLoaded,
      loading,
      providers,
      categories,
      providerOptions,
      channelOptions,
      pluginOptions,
    ],
  );
}
