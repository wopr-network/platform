import { useCallback, useEffect, useState } from "react";
import type { CapabilityMetaEntry } from "@/lib/api";
import { fetchCapabilityMeta } from "@/lib/settings-api";

/** Hardcoded fallback — same data as the old CAPABILITY_META. Used when backend is unavailable. */
const FALLBACK_META: CapabilityMetaEntry[] = [
  {
    capability: "transcription",
    label: "Transcription",
    description: "Powered by Whisper. No setup needed.",
    pricing: "$0.006/min",
    hostedProvider: "Whisper",
    icon: "mic",
    sortOrder: 0,
  },
  {
    capability: "image-gen",
    label: "Image Generation",
    description: "Powered by FLUX & Stable Diffusion.",
    pricing: "$0.05/image",
    hostedProvider: "FLUX",
    icon: "image",
    sortOrder: 1,
  },
  {
    capability: "text-gen",
    label: "Text Generation",
    description: "200+ models via OpenRouter.",
    pricing: "$0.002/1K tokens",
    hostedProvider: "OpenRouter",
    icon: "bot",
    sortOrder: 2,
  },
  {
    capability: "embeddings",
    label: "Embeddings",
    description: "High-quality vector embeddings.",
    pricing: "$0.0001/1K tokens",
    hostedProvider: "OpenAI",
    icon: "sparkles",
    sortOrder: 3,
  },
];

function formatLabel(capability: string): string {
  return capability.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fallbackEntry(capability: string): CapabilityMetaEntry {
  return {
    capability,
    label: formatLabel(capability),
    description: "",
    pricing: "",
    hostedProvider: "",
    icon: "sparkles",
    sortOrder: 999,
  };
}

export function useCapabilityMeta() {
  const [meta, setMeta] = useState<CapabilityMetaEntry[]>(FALLBACK_META);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchCapabilityMeta();
        if (!cancelled) {
          const sorted = [...data].sort((a, b) => a.sortOrder - b.sortOrder);
          setMeta(sorted);
        }
      } catch {
        if (!cancelled) {
          setError(true);
          setMeta(FALLBACK_META);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const getMeta = useCallback(
    (capability: string): CapabilityMetaEntry => {
      return meta.find((m) => m.capability === capability) ?? fallbackEntry(capability);
    },
    [meta],
  );

  return { meta, loading, error, getMeta };
}
