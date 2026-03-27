"use client";

import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ALL_CATEGORIES, type PluginCategory } from "@/lib/marketplace-data";
import { cn } from "@/lib/utils";

interface CategoryFilterProps {
  selected: PluginCategory | null;
  onSelect: (category: PluginCategory | null) => void;
  counts: Record<string, number>;
}

export function CategoryFilter({ selected, onSelect, counts }: CategoryFilterProps) {
  const categoriesWithPlugins = ALL_CATEGORIES.filter((c) => (counts[c.id] ?? 0) > 0);

  const items: { id: PluginCategory | null; label: string; count?: number }[] = [
    { id: null, label: "All" },
    ...categoriesWithPlugins.map((cat) => ({
      id: cat.id as PluginCategory,
      label: cat.label,
      count: counts[cat.id],
    })),
  ];

  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by category">
      {items.map((item) => {
        const isSelected = selected === item.id;
        return (
          <Button
            key={item.id ?? "all"}
            data-onboarding-id={`marketplace.category.${item.id ?? "all"}`}
            type="button"
            variant="ghost"
            role="tab"
            aria-selected={isSelected}
            onClick={() => onSelect(item.id)}
            className="relative p-0 h-auto hover:bg-transparent"
          >
            {isSelected && (
              <motion.div
                layoutId="category-highlight"
                className="absolute inset-0 rounded-sm bg-primary"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <Badge
              variant={isSelected ? "default" : "outline"}
              className={cn("relative cursor-pointer transition-colors", isSelected && "shadow-sm")}
            >
              {item.label}
              {item.count !== undefined && <span className="ml-1 opacity-60">{item.count}</span>}
            </Badge>
          </Button>
        );
      })}
    </div>
  );
}
