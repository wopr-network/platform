"use client";

import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MARKETPLACE_TABS, type MarketplaceTab } from "@/lib/marketplace-data";
import { cn } from "@/lib/utils";

interface MarketplaceTabsProps {
  selected: MarketplaceTab;
  onSelect: (tab: MarketplaceTab) => void;
  counts: Record<string, number>;
}

export function MarketplaceTabs({ selected, onSelect, counts }: MarketplaceTabsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {MARKETPLACE_TABS.map((tab) => {
        const isSelected = selected === tab.id;
        const count = counts[tab.id] ?? 0;

        return (
          <Button
            key={tab.id}
            data-onboarding-id={`marketplace.tab.${tab.id}`}
            type="button"
            variant="ghost"
            aria-pressed={isSelected}
            onClick={() => onSelect(tab.id)}
            className="relative p-0 h-auto hover:bg-transparent"
          >
            {isSelected && (
              <motion.div
                layoutId="marketplace-tab-highlight"
                className="absolute inset-0 rounded-sm bg-primary"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <Badge
              variant={isSelected ? "default" : "outline"}
              className={cn(
                "relative cursor-pointer text-xs font-medium transition-colors",
                isSelected && "shadow-sm",
              )}
            >
              {tab.label}
              {count > 0 && <span className="ml-1 opacity-60">{count}</span>}
            </Badge>
          </Button>
        );
      })}
    </div>
  );
}
