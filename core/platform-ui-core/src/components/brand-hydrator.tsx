"use client";

import { type BrandConfig, setBrandConfig } from "@/lib/brand-config";

/**
 * Client component that hydrates the brand config from server-fetched data.
 * Renders nothing — just calls setBrandConfig() during module evaluation
 * so all client components see the DB-driven config.
 */
export function BrandHydrator({ config }: { config: Partial<BrandConfig> }) {
  setBrandConfig(config);
  return null;
}
