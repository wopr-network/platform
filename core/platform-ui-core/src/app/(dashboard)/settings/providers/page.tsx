"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckIcon, ChevronDownIcon, XIcon } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { AddPaymentMethodDialog } from "@/components/billing/add-payment-method-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useCapabilityMeta } from "@/hooks/use-capability-meta";
import type {
  CapabilityMetaEntry,
  CapabilityMode,
  CapabilityName,
  CapabilitySetting,
  ProviderKey,
} from "@/lib/api";
import {
  getBillingInfo,
  getCreditBalance,
  listProviderKeys,
  removeProviderKey,
  saveProviderKey,
  testProviderKey,
  updateProviderModel,
} from "@/lib/api";
import { brandName } from "@/lib/brand-config";
import {
  listCapabilities,
  testProviderKey as testCapabilityViaTrpc,
  updateCapability,
} from "@/lib/settings-api";
import { cn } from "@/lib/utils";

// --- Helpers ---

function keyStatusVariant(status: CapabilitySetting["keyStatus"]) {
  if (status === "valid") return "default" as const;
  if (status === "invalid") return "destructive" as const;
  return "secondary" as const;
}

function providerKeyStatusVariant(status: ProviderKey["status"]) {
  if (status === "valid") return "default" as const;
  if (status === "invalid") return "destructive" as const;
  return "secondary" as const;
}

function formatLastChecked(lastChecked: string | null): string {
  if (!lastChecked) return "Never";
  const diff = Date.now() - new Date(lastChecked).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ago`;
}

// --- Main page ---

export default function ProvidersPage() {
  const [capabilities, setCapabilities] = useState<CapabilitySetting[]>([]);
  const [providers, setProviders] = useState<ProviderKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, "success" | "fail" | null>>({});
  const [testingCap, setTestingCap] = useState<string | null>(null);
  const [testCapResult, setTestCapResult] = useState<Record<string, "success" | "fail" | null>>({});
  const [savingCap, setSavingCap] = useState<string | null>(null);
  const [saveCapSuccess, setSaveCapSuccess] = useState<Record<string, boolean>>({});
  const [byokKeys, setByokKeys] = useState<Record<string, string>>({});
  const [billingGate, setBillingGate] = useState<string | null>(null);
  const saveCapSuccessTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const testCapResultTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const testResultTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { meta: capabilityMeta, loading: metaLoading, getMeta } = useCapabilityMeta();

  useEffect(() => {
    return () => {
      if (saveCapSuccessTimer.current) clearTimeout(saveCapSuccessTimer.current);
      if (testCapResultTimer.current) clearTimeout(testCapResultTimer.current);
      if (testResultTimer.current) clearTimeout(testResultTimer.current);
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [caps, provs] = await Promise.all([listCapabilities(), listProviderKeys()]);
      setCapabilities(caps);
      setProviders(provs);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleModeChange(capability: string, mode: CapabilityMode) {
    if (mode === "hosted") {
      setBillingGate(capability);
      return;
    }
    setSavingCap(capability);
    setError(null);
    try {
      const updated = await updateCapability(capability as CapabilityName, { mode });
      setCapabilities((prev) => prev.map((c) => (c.capability === capability ? updated : c)));
    } catch {
      setError("Failed to change capability mode. Please try again.");
    } finally {
      setSavingCap(null);
    }
  }

  async function handleHostedConfirm(capability: string) {
    setSavingCap(capability);
    setBillingGate(null);
    setError(null);
    try {
      const updated = await updateCapability(capability as CapabilityName, { mode: "hosted" });
      setCapabilities((prev) => prev.map((c) => (c.capability === capability ? updated : c)));
    } catch {
      setError("Failed to enable hosted mode. Please try again.");
    } finally {
      setSavingCap(null);
    }
  }

  async function handleSaveByokKey(capability: string) {
    const key = byokKeys[capability];
    if (!key) return;
    setSavingCap(capability);
    setError(null);
    try {
      const updated = await updateCapability(capability as CapabilityName, { mode: "byok", key });
      setCapabilities((prev) => prev.map((c) => (c.capability === capability ? updated : c)));
      setByokKeys((prev) => ({ ...prev, [capability]: "" }));
      setSaveCapSuccess((prev) => ({ ...prev, [capability]: true }));
      saveCapSuccessTimer.current = setTimeout(
        () => setSaveCapSuccess((prev) => ({ ...prev, [capability]: false })),
        2000,
      );
    } catch {
      setError("Failed to save API key. Please check the key and try again.");
    } finally {
      setSavingCap(null);
    }
  }

  async function handleTestCapability(capability: string) {
    setTestingCap(capability);
    setTestCapResult((prev) => ({ ...prev, [capability]: null }));
    try {
      await testCapabilityViaTrpc(capability as CapabilityName);
      const caps = await listCapabilities();
      setCapabilities(caps);
      const updatedCap = caps.find((c) => c.capability === capability);
      setTestCapResult((prev) => ({
        ...prev,
        [capability]: updatedCap?.keyStatus === "valid" ? "success" : "fail",
      }));
    } catch {
      setTestCapResult((prev) => ({ ...prev, [capability]: "fail" }));
    }
    setTestingCap(null);
    testCapResultTimer.current = setTimeout(
      () => setTestCapResult((prev) => ({ ...prev, [capability]: null })),
      2000,
    );
  }

  async function handleTest(id: string) {
    setTesting(id);
    setTestResult((prev) => ({ ...prev, [id]: null }));
    try {
      const result = await testProviderKey(id);
      setTestResult((prev) => ({
        ...prev,
        [id]: result.valid ? "success" : "fail",
      }));
    } catch {
      setTestResult((prev) => ({ ...prev, [id]: "fail" }));
    }
    const provs = await listProviderKeys();
    setProviders(provs);
    setTesting(null);
    testResultTimer.current = setTimeout(
      () => setTestResult((prev) => ({ ...prev, [id]: null })),
      2000,
    );
  }

  async function handleRemove(id: string, providerName: string) {
    const previousProviders = providers;
    setProviders((prev) => prev.filter((p) => p.id !== id));
    try {
      await removeProviderKey(id, providerName);
    } catch {
      setProviders(previousProviders);
      setError("Failed to remove provider key. Please try again.");
    }
  }

  async function handleModelChange(id: string, model: string) {
    const previousProviders = providers;
    setProviders((prev) => prev.map((p) => (p.id === id ? { ...p, defaultModel: model } : p)));
    try {
      await updateProviderModel(id, model);
    } catch {
      setProviders(previousProviders);
      setError("Failed to update model. Please try again.");
    }
  }

  if (loading || metaLoading) {
    return (
      <div className="max-w-2xl space-y-8">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-80" />
        </div>
        {Array.from({ length: 4 }, (_, n) => `sk-${n}`).map((skId) => (
          <div key={skId} className="rounded-sm border p-6 space-y-4">
            <Skeleton className="h-5 w-32" />
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-3 text-muted-foreground">
        <p className="text-sm text-destructive">Failed to load provider settings.</p>
        <Button variant="outline" size="sm" onClick={load}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-8">
      {/* Capability routing section */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Provider Settings</h1>
        <p className="text-sm text-muted-foreground">
          Choose {brandName()} Hosted or Bring Your Own Key for each capability. Changes take effect
          immediately.
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

      {capabilityMeta.map((meta) => {
        const capName = meta.capability;
        const cap = capabilities.find((c) => c.capability === capName);
        const mode = cap?.mode ?? "hosted";
        const isSaving = savingCap === capName;
        const isTesting = testingCap === capName;
        const byokKey = byokKeys[capName] ?? "";
        const capTestResult = testCapResult[capName];
        const isCapSaveSuccess = saveCapSuccess[capName] ?? false;

        return (
          <Card key={capName} data-testid={`capability-${capName}`}>
            <CardHeader>
              <CardTitle>{meta.label}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <RadioGroup
                value={mode}
                onValueChange={(v) => handleModeChange(capName, v as "hosted" | "byok")}
                disabled={isSaving}
                className="space-y-2"
              >
                {/* Hosted option */}
                <div
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-sm border p-3 transition-colors hover:bg-accent/50",
                    mode === "hosted" && "border-terminal/30 bg-terminal/5",
                  )}
                >
                  <RadioGroupItem value="hosted" id={`mode-${capName}-hosted`} className="mt-1" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Label
                        htmlFor={`mode-${capName}-hosted`}
                        className="text-sm font-medium cursor-pointer"
                      >
                        {brandName()} Hosted
                      </Label>
                      <Badge variant="outline">{meta.pricing}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{meta.description}</p>
                  </div>
                </div>

                {/* BYOK option */}
                <div
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-sm border p-3 transition-colors hover:bg-accent/50",
                    mode === "byok" && "border-primary/30 bg-primary/5",
                  )}
                >
                  <RadioGroupItem value="byok" id={`mode-${capName}-byok`} className="mt-1" />
                  <div className="flex-1">
                    <Label
                      htmlFor={`mode-${capName}-byok`}
                      className="text-sm font-medium cursor-pointer"
                    >
                      Bring Your Own Key
                    </Label>
                    {cap?.provider && (
                      <span className="ml-2 text-xs text-muted-foreground">({cap.provider})</span>
                    )}
                  </div>
                </div>
              </RadioGroup>

              {/* BYOK key input with progressive disclosure */}
              {mode === "byok" && (
                <Collapsible defaultOpen={!!cap?.maskedKey}>
                  <CollapsibleTrigger className="ml-8 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                    <ChevronDownIcon className="size-3" />
                    {cap?.maskedKey ? "Manage key" : "Add your API key"}
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="ml-8 space-y-3 pt-2">
                      {cap?.maskedKey && (
                        <div className="flex items-center gap-2">
                          <code className="text-xs text-muted-foreground">{cap.maskedKey}</code>
                          {cap.keyStatus && (
                            <Badge variant={keyStatusVariant(cap.keyStatus)}>{cap.keyStatus}</Badge>
                          )}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Input
                          type="password"
                          placeholder={
                            cap?.maskedKey ? "Enter new key to replace" : "Enter your API key"
                          }
                          value={byokKey}
                          onChange={(e) =>
                            setByokKeys((prev) => ({ ...prev, [capName]: e.target.value }))
                          }
                          className="flex-1"
                          aria-label={`${meta.label} API key`}
                        />
                        <Button
                          variant="terminal"
                          size="sm"
                          onClick={() => handleSaveByokKey(capName)}
                          disabled={!byokKey || isSaving}
                        >
                          <AnimatePresence mode="wait">
                            {isCapSaveSuccess ? (
                              <motion.span
                                key="success"
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                className="flex items-center gap-1"
                              >
                                <CheckIcon className="size-3" />
                                Saved
                              </motion.span>
                            ) : (
                              <motion.span
                                key="default"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                              >
                                {isSaving ? "Saving..." : "Save"}
                              </motion.span>
                            )}
                          </AnimatePresence>
                        </Button>
                      </div>
                      {cap?.maskedKey && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleTestCapability(capName)}
                          disabled={isTesting}
                        >
                          <AnimatePresence mode="wait">
                            {isTesting ? (
                              <motion.span
                                key="testing"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                              >
                                Testing...
                              </motion.span>
                            ) : capTestResult === "success" ? (
                              <motion.span
                                key="success"
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="flex items-center gap-1 text-terminal"
                              >
                                <CheckIcon className="size-3" />
                                Valid
                              </motion.span>
                            ) : capTestResult === "fail" ? (
                              <motion.span
                                key="fail"
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="flex items-center gap-1 text-destructive"
                              >
                                <XIcon className="size-3" />
                                Failed
                              </motion.span>
                            ) : (
                              <motion.span
                                key="idle"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                              >
                                Test Key
                              </motion.span>
                            )}
                          </AnimatePresence>
                        </Button>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Billing gate dialog */}
      {billingGate && (
        <BillingGateDialog
          meta={getMeta(billingGate)}
          onConfirm={() => handleHostedConfirm(billingGate)}
          onCancel={() => setBillingGate(null)}
        />
      )}

      {/* Existing provider keys section */}
      <div className="border-t pt-8">
        <h2 className="text-xl font-bold tracking-tight">Provider Keys</h2>
        <p className="text-sm text-muted-foreground">
          Manage your BYOK API keys directly. Keys are stored securely and never leave your
          environment.
        </p>
      </div>

      {providers.map((provider) => (
        <Card key={provider.id}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "size-2 rounded-full",
                    provider.status === "valid" && "bg-terminal",
                    provider.status === "invalid" && "bg-destructive",
                    provider.status === "unchecked" && provider.maskedKey && "bg-amber-500",
                    provider.status === "unchecked" && !provider.maskedKey && "bg-muted-foreground",
                  )}
                />
                <CardTitle>{provider.provider}</CardTitle>
              </div>
              <Badge variant={providerKeyStatusVariant(provider.status)}>
                {provider.status === "unchecked" && !provider.maskedKey
                  ? "Not configured"
                  : provider.status}
              </Badge>
            </div>
            {provider.maskedKey && (
              <CardDescription>
                Key: <code className="text-xs">{provider.maskedKey}</code> -- Last checked:{" "}
                {formatLastChecked(provider.lastChecked)}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {provider.maskedKey ? (
              <>
                <div className="flex flex-col gap-2">
                  <Label htmlFor={`model-${provider.id}`}>Default model</Label>
                  <Select
                    value={provider.defaultModel ?? ""}
                    onValueChange={(v) => handleModelChange(provider.id, v)}
                  >
                    <SelectTrigger id={`model-${provider.id}`} className="w-full">
                      <SelectValue placeholder="Select a model" />
                    </SelectTrigger>
                    <SelectContent>
                      {provider.models.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTest(provider.id)}
                    disabled={testing === provider.id}
                  >
                    <AnimatePresence mode="wait">
                      {testing === provider.id ? (
                        <motion.span
                          key="testing"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                        >
                          Testing...
                        </motion.span>
                      ) : testResult[provider.id] === "success" ? (
                        <motion.span
                          key="success"
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="flex items-center gap-1 text-terminal"
                        >
                          <CheckIcon className="size-3" />
                          Valid
                        </motion.span>
                      ) : testResult[provider.id] === "fail" ? (
                        <motion.span
                          key="fail"
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="flex items-center gap-1 text-destructive"
                        >
                          <XIcon className="size-3" />
                          Failed
                        </motion.span>
                      ) : (
                        <motion.span key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                          Test connection
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </Button>
                  <RotateKeyDialog provider={provider} onSaved={load} />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => handleRemove(provider.id, provider.provider)}
                  >
                    Remove
                  </Button>
                </div>
              </>
            ) : (
              <AddKeyDialog provider={provider} onSaved={load} />
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// --- Billing gate dialog ---

function BillingGateDialog({
  meta,
  onConfirm,
  onCancel,
}: {
  meta: CapabilityMetaEntry;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [canActivate, setCanActivate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddPayment, setShowAddPayment] = useState(false);

  const checkBilling = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [billing, credits] = await Promise.all([getBillingInfo(), getCreditBalance()]);
      setCanActivate(billing.paymentMethods.length > 0 || credits.balance > 0);
    } catch {
      setError("Unable to verify payment status. Please try again.");
      setCanActivate(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkBilling();
  }, [checkBilling]);

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onCancel()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Enable {brandName()} Hosted for {meta.label}?
            </DialogTitle>
            <DialogDescription>
              {brandName()} Hosted for {meta.label.toLowerCase()} costs {meta.pricing}. This will be
              billed to your payment method on file.
            </DialogDescription>
          </DialogHeader>

          {loading && (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <span className="size-3.5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
              Checking payment status...
            </div>
          )}

          {error && !loading && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {!loading && !error && !canActivate && (
            <div className="rounded-md border border-yellow-500/50 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
              <p className="font-medium">Payment method required</p>
              <p className="mt-1 text-muted-foreground">
                You need a payment method or credit balance before enabling hosted capabilities.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            {!loading && !canActivate && !error && (
              <Button onClick={() => setShowAddPayment(true)}>Add payment method</Button>
            )}
            {!loading && error && (
              <Button variant="outline" onClick={checkBilling}>
                Retry
              </Button>
            )}
            {!loading && canActivate && <Button onClick={onConfirm}>Enable Hosted</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AddPaymentMethodDialog
        open={showAddPayment}
        onOpenChange={setShowAddPayment}
        onSuccess={() => {
          setShowAddPayment(false);
          checkBilling();
        }}
      />
    </>
  );
}

// --- Existing dialogs (preserved from WOP-293) ---

function AddKeyDialog({ provider, onSaved }: { provider: ProviderKey; onSaved: () => void }) {
  const [key, setKey] = useState("");
  const [open, setOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    try {
      await saveProviderKey(provider.provider, key);
      setKey("");
      setOpen(false);
      onSaved();
    } catch {
      setSubmitError("Failed to save key. Please check and try again.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) setSubmitError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button>Add key</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add {provider.provider} API Key</DialogTitle>
          <DialogDescription>
            Paste your {provider.provider} API key below. It will be validated before saving.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-provider-key">API Key</Label>
            <Input
              id="new-provider-key"
              type="password"
              placeholder="Enter your API key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              required
            />
          </div>
          {submitError && <p className="text-sm text-destructive">{submitError}</p>}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit">Save key</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RotateKeyDialog({ provider, onSaved }: { provider: ProviderKey; onSaved: () => void }) {
  const [key, setKey] = useState("");
  const [open, setOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    try {
      await saveProviderKey(provider.provider, key);
      setKey("");
      setOpen(false);
      onSaved();
    } catch {
      setSubmitError("Failed to replace key. Please check and try again.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) setSubmitError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Rotate key
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rotate {provider.provider} Key</DialogTitle>
          <DialogDescription>
            Paste your new API key. The old key will be replaced after validation.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="rotate-provider-key">New API Key</Label>
            <Input
              id="rotate-provider-key"
              type="password"
              placeholder="Enter your new API key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              required
            />
          </div>
          {submitError && <p className="text-sm text-destructive">{submitError}</p>}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit">Replace key</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
