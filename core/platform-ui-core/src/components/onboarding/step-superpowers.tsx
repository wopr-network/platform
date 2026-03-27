"use client";

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { usePluginRegistry } from "@/hooks/use-plugin-registry";
import { productName } from "@/lib/brand-config";
import { cn } from "@/lib/utils";

// Types previously from use-onboarding, inlined for WOP-1018 compatibility
type WizardMode = "onboarding" | "fleet-add";
interface ExistingBot {
  id: string;
  name: string;
  plugins: string[];
  superpowers: string[];
}

interface StepSuperpowersProps {
  selected: string[];
  onToggle: (id: string) => void;
  mode?: WizardMode;
  existingBots?: ExistingBot[];
  stepNumber?: string;
  stepCode?: string;
}

export function StepSuperpowers({
  selected,
  onToggle,
  mode = "onboarding",
  existingBots = [],
  stepNumber = "04",
  stepCode = "SUPERPOWERS",
}: StepSuperpowersProps) {
  const { superpowers } = usePluginRegistry();
  const isFleetAdd = mode === "fleet-add";

  // Build a map of superpower id -> list of bot names that use it
  const usageMap = useMemo(() => {
    if (!isFleetAdd) return new Map<string, string[]>();
    const map = new Map<string, string[]>();
    for (const bot of existingBots) {
      for (const spId of bot.superpowers) {
        const list = map.get(spId) || [];
        list.push(bot.name);
        map.set(spId, list);
      }
    }
    return map;
  }, [isFleetAdd, existingBots]);

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div
          className="inline-block font-mono text-xs tracking-[0.3em] text-terminal uppercase"
          aria-hidden="true"
        >
          STEP {stepNumber} {"//"} {stepCode}
        </div>
        <h2 className="text-2xl font-bold tracking-tight">Give your {productName()} superpowers</h2>
        <p className="mt-2 text-muted-foreground">
          {isFleetAdd
            ? "Pre-checked from your other bots. Add or remove as you like."
            : "Pick as many as you want. All optional."}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {superpowers.map((sp) => {
          const isSelected = selected.includes(sp.id);
          const usedBy = usageMap.get(sp.id);
          const isUsedByFleet = isFleetAdd && usedBy && usedBy.length > 0;
          return (
            <Card
              key={sp.id}
              className={cn(
                "py-3 transition-all",
                isSelected
                  ? "border-terminal/60 bg-terminal/5 shadow-[0_0_8px_rgba(0,255,65,0.1)]"
                  : "border-border/50 hover:border-terminal/30",
              )}
            >
              <CardContent className="flex items-center justify-between gap-4 py-0">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
                    style={{ backgroundColor: sp.color }}
                  >
                    {sp.name[0]}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{sp.name}</p>
                    <p className="text-xs text-muted-foreground">{sp.tagline}</p>
                    {isUsedByFleet && (
                      <p className="text-xs text-primary">
                        {usedBy.join(", ")} {usedBy.length === 1 ? "uses" : "use"} this
                      </p>
                    )}
                  </div>
                </div>
                <Switch
                  data-onboarding-id={`onboarding.superpower.${sp.id}`}
                  checked={isSelected}
                  onCheckedChange={() => onToggle(sp.id)}
                  aria-label={`Toggle ${sp.name}`}
                />
              </CardContent>
            </Card>
          );
        })}
      </div>

      {selected.length === 0 && (
        <p className="text-center font-mono text-xs tracking-wider text-terminal/40 mt-4">
          NO SUPERPOWERS SELECTED — ALL OPTIONAL
        </p>
      )}
    </div>
  );
}
