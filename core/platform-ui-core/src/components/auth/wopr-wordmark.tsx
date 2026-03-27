"use client";

import { brandName, getBrandConfig } from "@/lib/brand-config";

export function BrandWordmark() {
  const tagline = getBrandConfig().tagline;
  return (
    <div className="mb-6 flex flex-col items-center gap-1">
      <span className="text-2xl font-bold uppercase tracking-[0.3em] text-terminal">
        {brandName()}
      </span>
      <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{tagline}</span>
    </div>
  );
}

/** @deprecated Use BrandWordmark instead */
export const WoprWordmark = BrandWordmark;
