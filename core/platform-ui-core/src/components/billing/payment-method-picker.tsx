"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import type { SupportedPaymentMethod } from "@/lib/api";
import { cn } from "@/lib/utils";

type Filter = "popular" | "stablecoins" | "l2" | "native";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "popular", label: "Popular" },
  { key: "stablecoins", label: "Stablecoins" },
  { key: "l2", label: "L2s" },
  { key: "native", label: "Native" },
];

const STABLECOIN_TOKENS = new Set(["USDC", "USDT", "DAI"]);
const L2_CHAINS = new Set(["base", "arbitrum", "optimism", "polygon"]);
const POPULAR_COUNT = 6;

interface PaymentMethodPickerProps {
  methods: SupportedPaymentMethod[];
  onSelect: (method: SupportedPaymentMethod) => void;
  onBack?: () => void;
}

export function PaymentMethodPicker({ methods, onSelect, onBack }: PaymentMethodPickerProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("popular");

  const filtered = useMemo(() => {
    if (search) {
      const q = search.toLowerCase();
      return methods.filter(
        (m) =>
          m.token.toLowerCase().includes(q) ||
          m.chain.toLowerCase().includes(q) ||
          m.displayName.toLowerCase().includes(q),
      );
    }

    switch (filter) {
      case "popular":
        return methods.slice(0, POPULAR_COUNT);
      case "stablecoins":
        return methods.filter((m) => STABLECOIN_TOKENS.has(m.token));
      case "l2":
        return methods.filter((m) => L2_CHAINS.has(m.chain));
      case "native":
        return methods.filter((m) => m.type === "native" && !L2_CHAINS.has(m.chain));
      default:
        return methods;
    }
  }, [methods, search, filter]);

  return (
    <div className="space-y-3">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Back
        </button>
      )}
      <Input
        placeholder="Search token or network..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => {
              setFilter(f.key);
              setSearch("");
            }}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              filter === f.key && !search
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="max-h-[320px] space-y-2 overflow-y-auto">
        {filtered.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onSelect(m)}
            className="flex w-full items-center justify-between rounded-lg border border-border p-3 text-left transition-colors hover:bg-accent"
          >
            <div className="flex items-center gap-3">
              {m.iconUrl && (
                // biome-ignore lint/performance/noImgElement: external dynamic URLs
                <img
                  src={m.iconUrl}
                  alt={m.token}
                  className="h-7 w-7 rounded-full"
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              )}
              <div>
                <div className="text-sm font-medium">{m.displayName}</div>
                <div className="text-xs text-muted-foreground">
                  {m.token} &middot; {m.chain}
                  {m.type === "erc20" ? " · ERC-20" : " · Native"}
                </div>
              </div>
            </div>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">No payment methods found</p>
        )}
      </div>
    </div>
  );
}
