"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { CapabilityProviderPicker } from "@/components/capability/CapabilityResolver";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useCapabilityMeta } from "@/hooks/use-capability-meta";
import { toUserMessage } from "@/lib/errors";
import type {
  BotSummary,
  CapabilityConflict,
  ConfigSchemaField,
  PluginManifest,
  SetupStep,
} from "@/lib/marketplace-data";
import {
  detectCapabilityConflictsClient,
  getCapabilityColor,
  listBots,
  listInstalledPlugins,
  listMarketplacePlugins,
} from "@/lib/marketplace-data";
import { cn } from "@/lib/utils";

// --- Step types for the wizard flow ---
type WizardPhase = "bot-select" | "requirements" | "conflicts" | "providers" | "setup" | "complete";

interface InstallWizardProps {
  plugin: PluginManifest;
  onComplete: (botId: string, config: Record<string, unknown>) => void;
  onCancel: () => void;
}

export function InstallWizard({ plugin, onComplete, onCancel }: InstallWizardProps) {
  const { meta: capabilityMeta } = useCapabilityMeta();
  const hasRequirements = plugin.requires.length > 0;
  const hasHosted = plugin.capabilities.some((cap) =>
    capabilityMeta.some((m) => m.capability === cap && !!m.hostedProvider),
  );

  // Determine phases — bot-select is always first
  // conflicts phase is always included; it auto-skips if no conflicts detected
  const phases: WizardPhase[] = ["bot-select"];
  if (hasRequirements) phases.push("requirements");
  phases.push("conflicts");
  if (hasHosted) phases.push("providers");
  phases.push("setup");
  phases.push("complete");

  const [currentPhaseIndex, setCurrentPhaseIndex] = useState(0);
  const [setupStepIndex, setSetupStepIndex] = useState(0);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [providerChoices, setProviderChoices] = useState<Record<string, "byok" | "hosted">>({});
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [bots, setBots] = useState<BotSummary[]>([]);
  const [botsLoading, setBotsLoading] = useState(true);
  const [botsError, setBotsError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<CapabilityConflict[]>([]);
  const [conflictsLoading, setConflictsLoading] = useState(false);
  const [conflictsError, setConflictsError] = useState<string | null>(null);
  const [primaryOverrides, setPrimaryOverrides] = useState<Record<string, string>>({});
  const [requirementsSatisfied, setRequirementsSatisfied] = useState(false);
  const [requirementsLoading, setRequirementsLoading] = useState(false);

  useEffect(() => {
    listBots()
      .then((data) => {
        setBots(data);
        setBotsLoading(false);
      })
      .catch((err: unknown) => {
        setBotsError(toUserMessage(err, "Failed to load bots"));
        setBotsLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!selectedBotId || plugin.requires.length === 0) {
      setRequirementsSatisfied(true);
      return;
    }
    setRequirementsLoading(true);
    setRequirementsSatisfied(false);

    listInstalledPlugins(selectedBotId)
      .then((installed) => {
        const installedIds = new Set(installed.map((p) => p.pluginId));
        const allSatisfied = plugin.requires.every((req) => installedIds.has(req.id));
        setRequirementsSatisfied(allSatisfied);
        setRequirementsLoading(false);
      })
      .catch(() => {
        setRequirementsSatisfied(false);
        setRequirementsLoading(false);
      });
  }, [selectedBotId, plugin]);

  useEffect(() => {
    if (!selectedBotId || plugin.capabilities.length === 0) {
      setConflicts([]);
      return;
    }
    setConflictsLoading(true);
    setConflictsError(null);

    Promise.all([listInstalledPlugins(selectedBotId), listMarketplacePlugins()])
      .then(([installed, allPlugins]) => {
        const installedIds = installed.map((p) => p.pluginId);
        const detected = detectCapabilityConflictsClient(plugin, installedIds, allPlugins);
        setConflicts(detected);
        setConflictsLoading(false);
      })
      .catch((err: unknown) => {
        setConflictsError(toUserMessage(err, "Failed to check for conflicts"));
        setConflictsLoading(false);
      });
  }, [selectedBotId, plugin]);

  const currentPhase = phases[currentPhaseIndex];

  // Auto-skip conflicts phase if no conflicts and not loading
  useEffect(() => {
    if (
      currentPhase === "conflicts" &&
      conflicts.length === 0 &&
      !conflictsLoading &&
      !conflictsError
    ) {
      setCurrentPhaseIndex((i) => i + 1);
    }
  }, [currentPhase, conflicts, conflictsLoading, conflictsError]);
  const setupSteps = plugin.setup;
  const currentSetupStep = setupSteps[setupStepIndex] as SetupStep | undefined;

  // Progress: count requirements + providers as 1 step each, then setup steps, then complete
  const stepsBeforeSetup = phases.filter(
    (p) => p !== "setup" && p !== "complete" && phases.indexOf(p) < currentPhaseIndex,
  ).length;
  const totalSteps =
    phases.filter((p) => p !== "setup" && p !== "complete").length + setupSteps.length + 1;
  const currentStepNumber =
    currentPhase === "setup"
      ? stepsBeforeSetup + setupStepIndex + 1
      : currentPhase === "complete"
        ? totalSteps
        : stepsBeforeSetup + 1;
  const progress = (currentStepNumber / totalSteps) * 100;

  const handleChange = useCallback((key: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      delete next._form;
      return next;
    });
  }, []);

  function validateFields(fields: ConfigSchemaField[]): boolean {
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const field of fields) {
      if (field.type === "boolean") {
        shape[field.key] = z.boolean().optional();
      } else if (field.type === "number") {
        shape[field.key] = z.number().optional();
      } else {
        let strSchema = z.string();
        if (field.required) {
          strSchema = strSchema.min(1, `${field.label} is required`);
        }
        if (field.validation?.pattern) {
          strSchema = strSchema.regex(
            new RegExp(field.validation.pattern),
            field.validation.message || "Invalid format",
          );
        }
        shape[field.key] = field.required ? strSchema : strSchema.optional().or(z.literal(""));
      }
    }
    const schema = z.object(shape);
    const fieldValues: Record<string, unknown> = {};
    for (const field of fields) {
      fieldValues[field.key] = values[field.key];
    }
    const result = schema.safeParse(fieldValues);
    if (result.success) {
      setErrors({});
      return true;
    }
    const stepErrors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      if (issue.path.length > 0) {
        const key = issue.path[0] as string;
        stepErrors[key] = issue.message;
      } else {
        // Object-level errors (refinements, superRefine, union discriminants) have empty path.
        // Collect under _form so they render in a general error area.
        stepErrors._form = stepErrors._form
          ? `${stepErrors._form}. ${issue.message}`
          : issue.message;
      }
    }
    setErrors(stepErrors);
    return false;
  }

  function handleNext() {
    if (currentPhase === "bot-select") {
      if (!selectedBotId) {
        setErrors({ _botId: "Please select a bot to install on" });
        return;
      }
      setCurrentPhaseIndex((i) => i + 1);
      setErrors({});
      return;
    }

    if (currentPhase === "setup" && currentSetupStep) {
      if (!validateFields(currentSetupStep.fields)) return;
      if (setupStepIndex < setupSteps.length - 1) {
        setSetupStepIndex((s) => s + 1);
        return;
      }
    }

    if (currentPhase === "conflicts") {
      const unresolved = conflicts.filter((c) => !primaryOverrides[c.capability]);
      if (unresolved.length > 0) {
        setErrors({
          _conflicts: "Please choose a primary provider for each conflicting capability",
        });
        return;
      }
      setCurrentPhaseIndex((i) => i + 1);
      setErrors({});
      return;
    }

    if (currentPhase === "complete") {
      if (selectedBotId) {
        onComplete(selectedBotId, {
          ...values,
          _providerChoices: providerChoices,
          _primaryProviderOverrides: primaryOverrides,
        });
      }
      return;
    }

    setCurrentPhaseIndex((i) => i + 1);
    setErrors({});
  }

  function handleBack() {
    if (currentPhase === "setup" && setupStepIndex > 0) {
      setSetupStepIndex((s) => s - 1);
      setErrors({});
      return;
    }
    if (currentPhaseIndex > 0) {
      setCurrentPhaseIndex((i) => i - 1);
      setErrors({});
    }
  }

  const isFirstStep = currentPhaseIndex === 0 && (currentPhase !== "setup" || setupStepIndex === 0);
  const allConflictsResolved = conflicts.every((c) => primaryOverrides[c.capability]);
  const isContinueDisabled =
    (currentPhase === "bot-select" && !selectedBotId) ||
    (currentPhase === "requirements" && (requirementsLoading || !requirementsSatisfied)) ||
    (currentPhase === "conflicts" && conflicts.length > 0 && !allConflictsResolved);

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-white"
            style={{ backgroundColor: plugin.color }}
          >
            {plugin.name[0]}
          </div>
          <div>
            <CardTitle>Install {plugin.name}</CardTitle>
            <CardDescription>
              {currentPhase === "bot-select" && "Select which bot to install this plugin on"}
              {currentPhase === "requirements" && "Check plugin requirements"}
              {currentPhase === "conflicts" && "Resolve capability conflicts"}
              {currentPhase === "providers" && "Choose provider for each capability"}
              {currentPhase === "setup" && currentSetupStep?.description}
              {currentPhase === "complete" && "Installation complete"}
            </CardDescription>
          </div>
        </div>
        <div className="mt-4 space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              Step {currentStepNumber} of {totalSteps}
            </span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} />
        </div>
      </CardHeader>

      <CardContent>
        {currentPhase === "bot-select" && (
          <BotSelector
            bots={bots}
            loading={botsLoading}
            selectedBotId={selectedBotId}
            onSelect={setSelectedBotId}
            loadError={botsError}
            error={errors._botId}
          />
        )}
        {currentPhase === "requirements" && selectedBotId && (
          <RequirementsCheck plugin={plugin} botId={selectedBotId} />
        )}
        {currentPhase === "conflicts" && conflicts.length > 0 && (
          <CapabilityConflicts
            conflicts={conflicts}
            loading={conflictsLoading}
            error={conflictsError}
            plugin={plugin}
            overrides={primaryOverrides}
            onChoose={(capability, pluginId) =>
              setPrimaryOverrides((prev) => ({ ...prev, [capability]: pluginId }))
            }
          />
        )}
        {currentPhase === "providers" && (
          <CapabilityProviderPicker
            capabilities={plugin.capabilities}
            choices={providerChoices}
            onChoose={(cap, choice) => setProviderChoices((prev) => ({ ...prev, [cap]: choice }))}
          />
        )}
        {currentPhase === "setup" && currentSetupStep && (
          <SetupStepForm
            step={currentSetupStep}
            values={values}
            errors={errors}
            onChange={handleChange}
          />
        )}
        {currentPhase === "complete" && (
          <div className="py-4 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15">
              <span className="text-2xl text-emerald-500">&#10003;</span>
            </div>
            <p className="font-medium">Plugin installed successfully</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {plugin.name} is now active on your instance.
            </p>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex justify-between">
        <div>
          {isFirstStep ? (
            <Button
              data-onboarding-id="marketplace.wizard.cancel"
              variant="ghost"
              onClick={onCancel}
            >
              Cancel
            </Button>
          ) : (
            <Button
              data-onboarding-id="marketplace.wizard.back"
              variant="ghost"
              onClick={handleBack}
            >
              Back
            </Button>
          )}
        </div>
        <Button
          data-onboarding-id="marketplace.wizard.continue"
          onClick={handleNext}
          disabled={isContinueDisabled}
        >
          {currentPhase === "complete" ? "Done" : "Continue"}
        </Button>
      </CardFooter>
    </Card>
  );
}

// --- Sub-components ---

function BotSelector({
  bots,
  loading,
  selectedBotId,
  onSelect,
  loadError,
  error,
}: {
  bots: BotSummary[];
  loading: boolean;
  selectedBotId: string | null;
  onSelect: (id: string) => void;
  loadError?: string | null;
  error?: string;
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="py-4 text-center">
        <p className="text-sm text-destructive">{loadError}</p>
      </div>
    );
  }

  if (bots.length === 0) {
    return (
      <div className="py-4 text-center">
        <p className="text-sm text-muted-foreground">
          No bots found. Create a bot instance first before installing plugins.
        </p>
        <Button variant="outline" className="mt-3" asChild>
          <Link href="/instances/new">Create a Bot</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Select which bot to install this plugin on:</p>
      {bots.map((bot) => (
        <Button
          key={bot.id}
          data-onboarding-id={`marketplace.wizard.select-bot.${bot.id}`}
          type="button"
          variant="ghost"
          onClick={() => onSelect(bot.id)}
          className={cn(
            "w-full rounded-lg border p-3 text-left h-auto transition-colors hover:bg-transparent",
            selectedBotId === bot.id
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50",
          )}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{bot.name}</p>
            <Badge variant="outline" className="text-[10px]">
              {bot.state}
            </Badge>
          </div>
        </Button>
      ))}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function RequirementsCheck({ plugin, botId }: { plugin: PluginManifest; botId: string }) {
  const [results, setResults] = useState<
    { id: string; label: string; status: "satisfied" | "missing" | "loading" | "error" }[]
  >(plugin.requires.map((r) => ({ ...r, status: "loading" })));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setResults(plugin.requires.map((r) => ({ ...r, status: "loading" })));
    setError(null);

    listInstalledPlugins(botId)
      .then((installed) => {
        const installedIds = new Set(installed.map((p) => p.pluginId));
        setResults(
          plugin.requires.map((req) => ({
            ...req,
            status: installedIds.has(req.id) ? "satisfied" : "missing",
          })),
        );
      })
      .catch((err: unknown) => {
        setError(toUserMessage(err, "Failed to check dependencies"));
        setResults(plugin.requires.map((r) => ({ ...r, status: "error" })));
      });
  }, [botId, plugin]);

  if (error) {
    return (
      <div className="py-4 text-center">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (plugin.requires.length === 0) {
    return (
      <div className="py-4 text-center">
        <p className="text-sm text-muted-foreground">No additional dependencies required.</p>
      </div>
    );
  }

  const isLoading = results.some((r) => r.status === "loading");

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        This plugin requires the following dependencies:
      </p>
      {isLoading ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Checking installed plugins...</p>
          {plugin.requires.map((req) => (
            <Skeleton key={req.id} className="h-8 w-full" />
          ))}
        </div>
      ) : (
        <ul className="space-y-2">
          {results.map((req) => (
            <li key={req.id} className="flex items-center gap-2 text-sm">
              {req.status === "satisfied" ? (
                <span className="text-emerald-500">&#10003;</span>
              ) : (
                <span className="text-destructive">&#10007;</span>
              )}
              <span>{req.label}</span>
              <Badge variant="outline" className="text-[10px]">
                {req.id}
              </Badge>
              {req.status === "missing" && (
                <span className="text-xs text-destructive">Not installed</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {!isLoading && results.some((r) => r.status === "missing") && (
        <div className="mt-3 rounded-sm border border-destructive/25 bg-destructive/5 p-3">
          <p className="text-sm text-destructive">
            Install the missing dependencies before continuing.
          </p>
        </div>
      )}
      {plugin.install.length > 0 && (
        <div className="mt-4 rounded-sm border border-dashed p-3">
          <p className="text-xs text-muted-foreground">
            The following will be auto-installed: {plugin.install.join(", ")}
          </p>
        </div>
      )}
    </div>
  );
}

function SetupStepForm({
  step,
  values,
  errors,
  onChange,
}: {
  step: SetupStep;
  values: Record<string, unknown>;
  errors: Record<string, string>;
  onChange: (key: string, value: unknown) => void;
}) {
  if (step.fields.length === 0) {
    return (
      <div className="space-y-3">
        {step.instruction && <p className="text-sm text-muted-foreground">{step.instruction}</p>}
        {step.externalUrl && (
          <a
            href={step.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-sm text-primary underline underline-offset-4"
          >
            Open external link
          </a>
        )}
        {!step.instruction && !step.externalUrl && (
          <p className="text-sm text-muted-foreground">{step.description}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {errors._form && <p className="text-xs text-destructive">{errors._form}</p>}
      {step.instruction && <p className="text-sm text-muted-foreground">{step.instruction}</p>}
      {step.externalUrl && (
        <a
          href={step.externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-sm text-primary underline underline-offset-4"
        >
          Open external link
        </a>
      )}
      {step.fields.map((field) => (
        <ConfigFieldInput
          key={field.key}
          field={field}
          value={values[field.key]}
          error={errors[field.key]}
          onChange={(v) => onChange(field.key, v)}
        />
      ))}
    </div>
  );
}

function CapabilityConflicts({
  conflicts,
  loading,
  error,
  plugin,
  overrides,
  onChoose,
}: {
  conflicts: CapabilityConflict[];
  loading: boolean;
  error: string | null;
  plugin: PluginManifest;
  overrides: Record<string, string>;
  onChoose: (capability: string, pluginId: string) => void;
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-4 text-center">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-sm border border-amber-500/25 bg-amber-500/5 p-3">
        <p className="text-sm font-medium text-amber-500">Capability Conflict Detected</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {plugin.name} provides capabilities already provided by installed plugins. Choose which
          plugin should be the primary provider for each.
        </p>
      </div>
      {conflicts.map((conflict) => {
        const capColor = getCapabilityColor(conflict.capability);
        const selected = overrides[conflict.capability];
        return (
          <div key={conflict.capability} className="rounded-sm border p-4">
            <div className="mb-3 flex items-center gap-2">
              <Badge
                variant="outline"
                className={cn("text-[10px]", capColor.bg, capColor.text, capColor.border)}
              >
                {conflict.capability}
              </Badge>
              <span className="text-sm text-muted-foreground">provided by both plugins</span>
            </div>
            <div className="space-y-2">
              <Button
                type="button"
                variant={selected === conflict.existingPluginId ? "default" : "outline"}
                size="sm"
                className="w-full justify-start"
                onClick={() => onChoose(conflict.capability, conflict.existingPluginId)}
              >
                Keep {conflict.existingPluginName} as primary
              </Button>
              <Button
                type="button"
                variant={selected === conflict.newPluginId ? "default" : "outline"}
                size="sm"
                className="w-full justify-start"
                onClick={() => onChoose(conflict.capability, conflict.newPluginId)}
              >
                Use {plugin.name} as primary
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ConfigFieldInput({
  field,
  value,
  error,
  onChange,
}: {
  field: ConfigSchemaField;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
}) {
  if (field.type === "boolean") {
    return (
      <div className="flex items-center justify-between">
        <div>
          <Label>{field.label}</Label>
          {field.description && (
            <p className="text-xs text-muted-foreground">{field.description}</p>
          )}
        </div>
        <Switch
          checked={value === true || value === "true"}
          onCheckedChange={(checked) => onChange(checked)}
          aria-label={field.label}
        />
      </div>
    );
  }

  if (field.type === "select" && field.options) {
    return (
      <div className="flex flex-col gap-2">
        <Label htmlFor={`field-${field.key}`}>{field.label}</Label>
        {field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}
        <Select value={(value as string) ?? ""} onValueChange={(v) => onChange(v)}>
          <SelectTrigger id={`field-${field.key}`}>
            <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`field-${field.key}`}>{field.label}</Label>
      {field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}
      <Input
        id={`field-${field.key}`}
        type={field.secret ? "password" : field.type === "number" ? "number" : "text"}
        placeholder={field.placeholder}
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
