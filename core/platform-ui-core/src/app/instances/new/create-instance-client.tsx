"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { usePluginRegistry } from "@/hooks/use-plugin-registry";
import { createInstance } from "@/lib/api";
import { productName } from "@/lib/brand-config";
import { cn } from "@/lib/utils";

const PRESET_ACCENT_COLORS: Record<string, string> = {
  "discord-ai-bot": "#5865F2",
  "slack-ai-assistant": "#4A154B",
  "multi-channel": "#6366F1",
  "voice-enabled": "#8B5CF6",
  "api-only": "#FF6B6B",
};

export function CreateInstanceClient() {
  const { providerOptions, channelOptions, pluginOptions, presets, loading } = usePluginRegistry();
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("anthropic");
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [selectedPlugins, setSelectedPlugins] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const NAME_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

  function validateName(value: string): string | null {
    if (!value.trim()) return null;
    if (!NAME_PATTERN.test(value)) {
      return "Lowercase letters, numbers, and hyphens only. Must start and end with a letter or number.";
    }
    return null;
  }

  function handleNameChange(e: { target: { value: string } }) {
    const value = e.target.value;
    setName(value);
    setNameError(validateName(value));
  }

  function handlePresetSelect(presetId: string) {
    if (selectedPreset === presetId) {
      setSelectedPreset(null);
      setSelectedChannels([]);
      setSelectedPlugins([]);
      setProvider("anthropic");
      return;
    }
    setSelectedPreset(presetId);
    const preset = presets.find((p) => p.id === presetId);
    if (preset) {
      setSelectedChannels(preset.channels);
      setSelectedPlugins(preset.plugins);
      if (preset.providers.length > 0) {
        setProvider(preset.providers[0]);
      }
    }
  }

  function toggleChannel(ch: string) {
    setSelectedChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch],
    );
  }

  function togglePlugin(p: string) {
    setSelectedPlugins((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  const router = useRouter();

  async function handleSubmit() {
    if (!name.trim()) return;
    const validationError = validateName(name);
    if (validationError) {
      setNameError(validationError);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);

    const preset = presets.find((p) => p.id === selectedPreset);
    const payload = {
      name: name.trim(),
      template: preset?.name ?? "Custom",
      provider,
      channels: selectedChannels,
      plugins: selectedPlugins,
    };

    // Fire-and-forget: redirect immediately, let backend provision in background.
    // The instances page polls for status updates.
    createInstance(payload).catch(() => {
      // Silently handled — instance list will show provisioning/error state
    });

    setCreated(true);
    // Short delay for the success animation, then redirect to instances
    setTimeout(() => router.push("/instances"), 1500);
  }

  if (created) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-6">
        <motion.div
          className="flex h-16 w-16 items-center justify-center rounded-full border border-terminal/30 bg-terminal/10"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        >
          <Check className="h-8 w-8 text-terminal" />
        </motion.div>
        <motion.h2
          className="text-xl font-semibold"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          Instance created
        </motion.h2>
        <motion.p
          className="text-muted-foreground"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          Your instance <span className="font-medium text-terminal">&ldquo;{name}&rdquo;</span> has
          been created successfully.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Button variant="terminal" asChild>
            <Link href="/instances">Back to Instances</Link>
          </Button>
        </motion.div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <p className="animate-pulse text-sm text-muted-foreground">Loading plugins...</p>
      </div>
    );
  }

  const visiblePresets = presets.filter((p) => p.id !== "custom");

  return (
    <motion.div
      className="mx-auto max-w-3xl space-y-6"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Create Instance</h1>
        <p className="text-sm text-muted-foreground">
          Launch a new {productName()} bot. Pick a preset or go custom.
        </p>
      </div>

      {/* Instance Name (required, above presets) */}
      <div className="space-y-2">
        <Label htmlFor="instance-name">Instance Name</Label>
        <Input
          id="instance-name"
          placeholder="my-instance"
          value={name}
          onChange={handleNameChange}
          aria-invalid={nameError !== null}
          aria-describedby={nameError ? "instance-name-error" : "instance-name-hint"}
        />
        {nameError ? (
          <p id="instance-name-error" className="text-xs text-red-500">
            {nameError}
          </p>
        ) : (
          <p id="instance-name-hint" className="text-xs text-muted-foreground/60">
            Lowercase letters, numbers, and hyphens only
          </p>
        )}
      </div>

      <Separator />

      {/* Preset (optional) */}
      <div className="space-y-3">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.3em] text-terminal/60">
            QUICK START
          </div>
          <h2 className="text-sm font-medium text-muted-foreground">
            Select a preset to auto-fill, or skip to configure manually
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visiblePresets.map((preset, index) => (
            <motion.div
              key={preset.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: index * 0.05 }}
            >
              <Card
                className={cn(
                  "relative cursor-pointer transition-all hover:border-terminal/40 hover:shadow-[0_0_8px_rgba(0,255,65,0.15)]",
                  "border-l-2",
                  selectedPreset === preset.id &&
                    "border-terminal bg-terminal/5 shadow-[0_0_12px_rgba(0,255,65,0.2)]",
                )}
                style={{
                  borderLeftColor: PRESET_ACCENT_COLORS[preset.id] ?? "transparent",
                }}
                onClick={() => handlePresetSelect(preset.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handlePresetSelect(preset.id);
                  }
                }}
              >
                {selectedPreset === preset.id && (
                  <motion.div
                    className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-terminal/20 text-terminal"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 500, damping: 25 }}
                  >
                    <Check className="h-3 w-3" />
                  </motion.div>
                )}
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{preset.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <CardDescription className="text-xs">{preset.description}</CardDescription>
                  <div className="flex flex-wrap gap-1">
                    {[...preset.channels, ...preset.providers, ...preset.plugins].map((tag) => (
                      <span
                        key={tag}
                        className="inline-block rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  {preset.keyCount > 0 && (
                    <p className="text-[10px] text-muted-foreground/70">
                      {preset.keyCount} {preset.keyCount === 1 ? "key" : "keys"} needed
                    </p>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>

      <Separator />

      {/* Configuration */}
      <div className="space-y-4">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.3em] text-terminal/60">
            CONFIGURATION
          </div>
          <h2 className="text-sm font-medium text-muted-foreground">
            Fine-tune your instance settings
          </h2>
        </div>

        <div className="space-y-2">
          <label htmlFor="provider-select" className="text-sm text-muted-foreground">
            Provider
          </label>
          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger id="provider-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {providerOptions.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Separator />

      {/* Channels */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium">Channels</h2>
        <div className="flex flex-wrap gap-2">
          {channelOptions.map((ch) => (
            <Button
              key={ch.value}
              variant={selectedChannels.includes(ch.value) ? "default" : "outline"}
              size="sm"
              onClick={() => toggleChannel(ch.value)}
            >
              {ch.label}
            </Button>
          ))}
        </div>
      </div>

      <Separator />

      {/* Plugins */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium">Plugins</h2>
        <div className="flex flex-wrap gap-2">
          {pluginOptions.map((p) => (
            <Button
              key={p.value}
              variant={selectedPlugins.includes(p.value) ? "default" : "outline"}
              size="sm"
              onClick={() => togglePlugin(p.value)}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      <Separator />

      {submitError && (
        <motion.div
          className="rounded-md border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-500"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
        >
          <span className="font-bold">&gt; ERROR:</span> {submitError}
        </motion.div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <Button variant="outline" asChild>
          <Link href="/instances">Cancel</Link>
        </Button>
        <Button
          variant="terminal"
          className={cn(submitting && "animate-[terminal-pulse_2s_ease-in-out_infinite]")}
          onClick={handleSubmit}
          disabled={!name.trim() || !!nameError || submitting}
        >
          {submitting ? "Creating..." : "Create Instance"}
        </Button>
      </div>
    </motion.div>
  );
}
