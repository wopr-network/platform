"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ModelSelection } from "@/lib/api";
import { getModelSelection, saveProviderKey, updateModelSelection } from "@/lib/api";
import { productName } from "@/lib/brand-config";
import { logger } from "@/lib/logger";
import {
  additionalModels,
  allModels,
  byokProviders,
  heroModels,
  MODEL_COUNT,
  type ModelOption,
} from "@/lib/onboarding-data";
import { cn } from "@/lib/utils";

const log = logger("settings:brain");

type ViewMode = "models" | "byok";

function categoryBadgeVariant(cat: ModelOption["category"]) {
  const map: Record<ModelOption["category"], "default" | "secondary" | "outline" | "terminal"> = {
    reasoning: "default",
    general: "secondary",
    fast: "outline",
    code: "terminal",
    vision: "secondary",
    "open-source": "outline",
  };
  return map[cat];
}

export default function BrainSettingsPage() {
  const [selection, setSelection] = useState<ModelSelection | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("models");
  const [byokKey, setByokKey] = useState("");
  const [byokProvider, setByokProvider] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saveSuccessTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (saveSuccessTimer.current) clearTimeout(saveSuccessTimer.current);
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sel = await getModelSelection();
      setSelection(sel);
      setError(null);
    } catch (err) {
      log.error("Failed to load model selection", err);
      setError("Failed to load model settings. Please try refreshing the page.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSelectModel(model: ModelOption) {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateModelSelection({
        modelId: model.id,
        providerId: model.providerId,
        mode: "hosted",
      });
      setSelection(updated);
    } catch (err) {
      log.error("Failed to update model selection", err);
      setError("Failed to update model selection. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveByokKey(providerId: string) {
    if (!byokKey) return;
    setSaving(true);
    setError(null);
    try {
      await saveProviderKey(providerId, byokKey);
      const updated = await updateModelSelection({
        modelId: selection?.modelId ?? "anthropic/claude-sonnet-4-20250514",
        providerId,
        mode: "byok",
      });
      setSelection(updated);
      setByokKey("");
      setByokProvider(null);
      setSaveSuccess(true);
      saveSuccessTimer.current = setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      log.error("Failed to save BYOK key", err);
      setError("Failed to save your API key. Please check the key and try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center text-muted-foreground">
        Loading model settings...
      </div>
    );
  }

  const currentModel = allModels.find((m) => m.id === selection?.modelId);

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Brain</h1>
        <p className="text-sm text-muted-foreground">
          Choose which AI model powers your {productName()}. Changes take effect immediately.
        </p>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Current selection */}
      {currentModel && (
        <Card data-testid="current-model">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Current Model</CardTitle>
              <Badge variant={selection?.mode === "byok" ? "outline" : "terminal"}>
                {selection?.mode === "byok" ? "BYOK" : "Hosted"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{currentModel.name}</p>
                <p className="text-sm text-muted-foreground">{currentModel.description}</p>
                <div className="mt-2 flex items-center gap-2">
                  <Badge
                    variant={categoryBadgeVariant(currentModel.category)}
                    className="text-[10px]"
                  >
                    {currentModel.category}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{currentModel.provider}</span>
                </div>
              </div>
              <span className="text-sm font-medium">{currentModel.costPerMessage}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* View mode toggle */}
      <div className="flex gap-2">
        <Button
          variant={viewMode === "models" ? "default" : "outline"}
          size="sm"
          onClick={() => setViewMode("models")}
        >
          Pick a model (Hosted)
        </Button>
        <Button
          variant={viewMode === "byok" ? "default" : "outline"}
          size="sm"
          onClick={() => setViewMode("byok")}
        >
          Bring Your Own Key
        </Button>
      </div>

      {viewMode === "models" && (
        <>
          {/* Hero models */}
          <div className="grid gap-4 sm:grid-cols-3">
            {heroModels.map((model) => (
              <Button
                key={model.id}
                type="button"
                variant="ghost"
                className="w-full text-left h-auto p-0 hover:bg-transparent"
                onClick={() => handleSelectModel(model)}
                disabled={saving}
              >
                <Card
                  className={cn(
                    "relative h-full transition-all hover:shadow-md",
                    selection?.modelId === model.id
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "hover:border-primary/30",
                  )}
                  data-testid={`model-card-${model.id}`}
                >
                  {selection?.modelId === model.id && (
                    <motion.div
                      layoutId="selected-model"
                      className="pointer-events-none absolute inset-0 rounded-sm border-2 border-primary"
                      transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
                    />
                  )}
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{model.name}</CardTitle>
                      {model.recommended && <Badge variant="terminal">Recommended</Badge>}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{model.description}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      <Badge variant={categoryBadgeVariant(model.category)} className="text-[10px]">
                        {model.category}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{model.provider}</span>
                    </div>
                    <div className="mt-1 text-right">
                      <span className="text-xs font-medium">{model.costPerMessage}</span>
                    </div>
                  </CardContent>
                </Card>
              </Button>
            ))}
          </div>

          {/* More models -- Collapsible */}
          <Collapsible open={showMore} onOpenChange={setShowMore}>
            <CollapsibleTrigger
              className="flex w-full items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
              data-testid="more-models-toggle"
            >
              <motion.div animate={{ rotate: showMore ? 180 : 0 }} transition={{ duration: 0.2 }}>
                <ChevronDownIcon className="size-4" />
              </motion.div>
              <span>More models -- {MODEL_COUNT} models available</span>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="grid gap-3 pt-3 sm:grid-cols-2">
                {additionalModels.map((model) => (
                  <Button
                    key={model.id}
                    type="button"
                    variant="ghost"
                    className="w-full text-left h-auto p-0 hover:bg-transparent"
                    onClick={() => handleSelectModel(model)}
                    disabled={saving}
                  >
                    <Card
                      className={cn(
                        "relative h-full transition-all hover:shadow-md",
                        selection?.modelId === model.id
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "hover:border-primary/30",
                      )}
                    >
                      {selection?.modelId === model.id && (
                        <motion.div
                          layoutId="selected-model"
                          className="pointer-events-none absolute inset-0 rounded-sm border-2 border-primary"
                          transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
                        />
                      )}
                      <CardHeader className="pb-0">
                        <CardTitle className="text-sm">{model.name}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-xs text-muted-foreground">{model.description}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-1">
                          <Badge
                            variant={categoryBadgeVariant(model.category)}
                            className="text-[10px]"
                          >
                            {model.category}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{model.provider}</span>
                        </div>
                        <div className="mt-1 text-right">
                          <span className="text-xs font-medium">{model.costPerMessage}</span>
                        </div>
                      </CardContent>
                    </Card>
                  </Button>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </>
      )}

      {viewMode === "byok" && (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Bring your own provider key and bypass credits. {productName()} takes nothing when using
            BYOK providers -- you pay the provider directly.
          </p>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {byokProviders.map((provider) => (
              <Card
                key={provider.id}
                className={cn(
                  "transition-all",
                  byokProvider === provider.id
                    ? "border-primary bg-primary/5"
                    : "hover:border-primary/30",
                )}
              >
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
                      style={{ backgroundColor: provider.color }}
                    >
                      {provider.name[0]}
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-sm">{provider.name}</CardTitle>
                      <p className="text-xs text-muted-foreground">{provider.description}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() =>
                      setByokProvider(byokProvider === provider.id ? null : provider.id)
                    }
                  >
                    {byokProvider === provider.id ? "Cancel" : "Add key"}
                  </Button>
                  {byokProvider === provider.id && (
                    <div className="mt-3 space-y-2">
                      <Label htmlFor={`byok-key-${provider.id}`}>API Key</Label>
                      <Input
                        id={`byok-key-${provider.id}`}
                        type="password"
                        placeholder="Enter your API key"
                        value={byokKey}
                        onChange={(e) => setByokKey(e.target.value)}
                      />
                      <Button
                        variant="terminal"
                        size="sm"
                        className="w-full"
                        onClick={() => handleSaveByokKey(provider.id)}
                        disabled={!byokKey || saving}
                      >
                        <AnimatePresence mode="wait">
                          {saveSuccess ? (
                            <motion.span
                              key="success"
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.8 }}
                              className="flex items-center gap-1"
                            >
                              <CheckIcon className="size-4" />
                              Saved
                            </motion.span>
                          ) : (
                            <motion.span
                              key="default"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                            >
                              {saving ? "Saving..." : "Save key"}
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
