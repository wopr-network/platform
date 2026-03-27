"use client";

import { Loader2, Play, RotateCw, Square, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { LogsViewer } from "@/components/observability/logs-viewer";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CreditDetailed } from "@/components/ui/credit-detailed";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useFleetSSE } from "@/hooks/use-fleet-sse";
import { useSaveQueue } from "@/hooks/use-save-queue";
import type { InstanceHealth } from "@/lib/api";
import { getInstanceHealth } from "@/lib/api";
import type {
  ActiveSuperpower,
  AvailableSuperpower,
  BotChannel,
  BotSettings,
  DiscoverPlugin,
  InstalledPlugin,
} from "@/lib/bot-settings-data";
import {
  activateSuperpower,
  controlBot,
  disconnectChannel,
  getBotSettings,
  getBotStatus,
  getChannelConfig,
  getPluginConfig,
  getSuperpowerConfig,
  installPlugin,
  PERSONALITY_TEMPLATES,
  togglePlugin,
  uninstallPlugin,
  updateBotBrain,
  updateBotIdentity,
  updateChannelConfig,
  updatePluginConfig,
  updateSuperpowerConfig,
} from "@/lib/bot-settings-data";
import { brandName, productName } from "@/lib/brand-config";
import { toUserMessage } from "@/lib/errors";
import { formatCreditDetailed, formatCreditStandard } from "@/lib/format-credit";
import { DEFAULT_STATUS_STYLE, PLUGIN_STATUS_STYLES } from "@/lib/status-colors";
import { BackupsTab } from "./backups-tab";
import { ResourcesTab } from "./resources-tab";
import { StorageTab } from "./storage-tab";
import { VpsInfoPanel } from "./vps-info-panel";
import { VpsUpgradeCard } from "./vps-upgrade-card";

export function BotSettingsClient({ botId }: { botId: string }) {
  const [settings, setSettings] = useState<BotSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [health, setHealth] = useState<InstanceHealth | null>(null);
  const [statusChanged, setStatusChanged] = useState(false);
  const prevStatusRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getBotSettings(botId);
      setSettings(data);
    } catch (err) {
      setError(toUserMessage(err, "Failed to load bot settings"));
    } finally {
      setLoading(false);
    }
  }, [botId]);

  useEffect(() => {
    load();
  }, [load]);

  const settingsLoaded = settings !== null;

  // Fetch status and health once on mount (after settings loaded)
  useEffect(() => {
    if (!settingsLoaded) return;
    let cancelled = false;
    Promise.all([getBotStatus(botId), getInstanceHealth(botId)])
      .then(([{ status }, h]) => {
        if (!cancelled) {
          setSettings((prev) => (prev ? { ...prev, status } : prev));
          setHealth(h);
        }
      })
      .catch((_err) => {
        // Silently ignore — same as old polling behavior
      });
    return () => {
      cancelled = true;
    };
  }, [botId, settingsLoaded]);

  // Real-time bot status via SSE — re-fetch on events for this bot
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  useFleetSSE((event) => {
    if (event.botId !== botId) return;
    Promise.all([getBotStatus(botId), getInstanceHealth(botId)])
      .then(([{ status }, h]) => {
        if (mountedRef.current) {
          setSettings((prev) => (prev ? { ...prev, status } : prev));
          setHealth(h);
          if (status === "running") {
            setPendingAction((prev) => {
              if (prev === "restart") {
                setActionPending(false);
                return null;
              }
              return prev;
            });
          }
        }
      })
      .catch((_err) => {
        // Silently ignore — same as old polling behavior
      });
  });

  // Detect status changes for badge glow animation
  useEffect(() => {
    if (!settings) return;
    const currentStatus = settings.status;
    const changed = prevStatusRef.current !== null && prevStatusRef.current !== currentStatus;
    prevStatusRef.current = currentStatus;
    if (changed) {
      setStatusChanged(true);
      const timeout = setTimeout(() => setStatusChanged(false), 1000);
      return () => clearTimeout(timeout);
    }
  }, [settings]);

  // Auto-dismiss action error after 5 seconds
  useEffect(() => {
    if (!actionError) return;
    const timeout = setTimeout(() => setActionError(null), 5000);
    return () => clearTimeout(timeout);
  }, [actionError]);

  async function handleAction(action: "start" | "stop" | "restart") {
    setActionPending(true);
    setPendingAction(action);
    setActionError(null);
    try {
      await controlBot(botId, action);
      if (action === "start") {
        setSettings((prev) => (prev ? { ...prev, status: "running" } : prev));
      } else if (action === "stop") {
        setSettings((prev) => (prev ? { ...prev, status: "stopped" } : prev));
      }
      // Refetch full settings to pick up any server-side state changes
      load();
    } catch {
      setActionError(`Failed to ${action} bot`);
    } finally {
      if (action !== "restart") {
        setActionPending(false);
        setPendingAction(null);
      }
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-2 w-2 rounded-full" />
          <Skeleton className="h-7 w-48" />
        </div>
        <div className="flex gap-3">
          {Array.from({ length: 5 }, (_, n) => `sk-tab-${n}`).map((skId) => (
            <Skeleton key={skId} className="h-9 w-24" />
          ))}
        </div>
        <div className="space-y-4 rounded-md border p-6">
          <Skeleton className="h-5 w-32" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-20 w-full" />
          </div>
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
    );
  }

  if (error || !settings) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">{error ?? "Bot not found"}</p>
        <Button variant="outline" asChild>
          <Link href="/dashboard">Back to Dashboard</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard">&larr; Back to Fleet</Link>
        </Button>
        <div
          className={`transition-all duration-500 ${statusChanged ? "ring-2 ring-terminal/30 rounded-full" : ""}`}
        >
          {actionPending && pendingAction === "restart" ? (
            <Badge
              variant="outline"
              className="gap-1.5 bg-yellow-500/15 text-yellow-500 border-yellow-500/25"
            >
              <Loader2 className="size-3 animate-spin" />
              Restarting
            </Badge>
          ) : (
            <StatusBadge status={settings.status === "archived" ? "stopped" : settings.status} />
          )}
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{settings.identity.name}</h1>
        <div className="flex gap-2 ml-auto">
          {(settings.status === "stopped" || settings.status === "archived") && (
            <Button
              size="sm"
              variant="terminal"
              disabled={actionPending}
              onClick={() => handleAction("start")}
            >
              {actionPending && pendingAction === "start" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Play className="size-4" />
              )}
              Start
            </Button>
          )}
          {settings.status === "running" && !(actionPending && pendingAction === "restart") && (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={actionPending}
                className="border-red-500/40 text-red-400 hover:bg-red-500/10 hover:border-red-500/60"
                onClick={() => handleAction("stop")}
              >
                {actionPending && pendingAction === "stop" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Square className="size-3.5" />
                )}
                Stop
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={actionPending}
                onClick={() => handleAction("restart")}
              >
                <RotateCw
                  className={`size-3.5 ${actionPending && pendingAction === "restart" ? "animate-spin" : ""}`}
                />
                Restart
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Health info bar */}
      {health && health.uptime > 0 && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>
            Uptime: {Math.floor(health.uptime / 3600)}h {Math.floor((health.uptime % 3600) / 60)}m
          </span>
          <span>
            Sessions: {health.activeSessions} active / {health.totalSessions} total
          </span>
        </div>
      )}

      {/* Action error banner */}
      {actionError && (
        <div className="rounded-sm border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-400 animate-in fade-in duration-200">
          {actionError}
        </div>
      )}

      <Separator />

      {/* Tabs */}
      <Tabs defaultValue="identity">
        <TabsList className="flex-wrap">
          <TabsTrigger value="identity">Identity</TabsTrigger>
          <TabsTrigger value="brain">Brain</TabsTrigger>
          <TabsTrigger value="channels">Channels</TabsTrigger>
          <TabsTrigger value="superpowers">Superpowers</TabsTrigger>
          <TabsTrigger value="plugins">Plugins</TabsTrigger>
          <TabsTrigger value="storage">Storage</TabsTrigger>
          <TabsTrigger value="backups">Backups</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="resources">Resources</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="vps">VPS</TabsTrigger>
          <TabsTrigger value="danger">Danger Zone</TabsTrigger>
        </TabsList>

        <TabsContent value="identity" className="mt-4">
          <IdentityTab settings={settings} botId={botId} onUpdate={setSettings} />
        </TabsContent>

        <TabsContent value="brain" className="mt-4">
          <BrainTab settings={settings} botId={botId} onUpdate={setSettings} />
        </TabsContent>

        <TabsContent value="channels" className="mt-4">
          <ChannelsTab settings={settings} botId={botId} onUpdate={load} />
        </TabsContent>

        <TabsContent value="superpowers" className="mt-4">
          <SuperpowersTab settings={settings} botId={botId} onUpdate={load} />
        </TabsContent>

        <TabsContent value="plugins" className="mt-4">
          <PluginsTab settings={settings} botId={botId} onUpdate={load} />
        </TabsContent>

        <TabsContent value="storage" className="mt-4">
          <StorageTab botId={botId} />
        </TabsContent>

        <TabsContent value="backups" className="mt-4">
          <BackupsTab botId={botId} onRestore={load} />
        </TabsContent>

        <TabsContent value="usage" className="mt-4">
          <UsageTab settings={settings} />
        </TabsContent>

        <TabsContent value="resources" className="mt-4">
          <ResourcesTab botId={botId} />
        </TabsContent>

        <TabsContent value="logs" className="mt-6">
          <LogsViewer instanceId={botId} />
        </TabsContent>

        <TabsContent value="vps" className="mt-4">
          <div className="flex flex-col gap-4">
            <VpsInfoPanel botId={botId} />
            <VpsUpgradeCard botId={botId} />
          </div>
        </TabsContent>

        <TabsContent value="danger" className="mt-4">
          <DangerZoneTab settings={settings} botId={botId} onUpdate={load} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// --- Tab 1: Identity ---

function IdentityTab({
  settings,
  botId,
  onUpdate,
}: {
  settings: BotSettings;
  botId: string;
  onUpdate: (s: BotSettings) => void;
}) {
  const [name, setName] = useState(settings.identity.name);
  const [personality, setPersonality] = useState(settings.identity.personality);
  const [saved, setSaved] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current !== null) {
        clearTimeout(savedTimerRef.current);
      }
    };
  }, []);

  const saveFn = useCallback(
    async (payload: { name: string; avatar: string; personality: string }) => {
      try {
        const updated = await updateBotIdentity(botId, payload);
        onUpdate({ ...settings, identity: updated });
        setSaved(true);
        clearTimeout(savedTimerRef.current ?? undefined);
        savedTimerRef.current = setTimeout(() => setSaved(false), 2000);
      } catch {
        throw new Error("Failed to save \u2014 please try again.");
      }
    },
    [botId, settings, onUpdate],
  );

  const { enqueue: enqueueSave, saving, error: saveError } = useSaveQueue(saveFn);

  function handleSave() {
    enqueueSave({ name, avatar: settings.identity.avatar, personality });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-bold">Identity</h2>
        <p className="text-sm text-muted-foreground">Customize your bot's name and personality.</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="bot-name" className="text-sm font-medium">
            Name
          </label>
          <Input id="bot-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="space-y-2">
          <label htmlFor="bot-personality" className="text-sm font-medium">
            Personality
          </label>
          <Textarea
            id="bot-personality"
            className="min-h-[120px]"
            value={personality}
            onChange={(e) => setPersonality(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <span className="text-sm font-medium">Personality templates</span>
          <div className="flex flex-wrap gap-2">
            {PERSONALITY_TEMPLATES.map((t) => (
              <Button
                key={t.id}
                variant="outline"
                size="sm"
                onClick={() => {
                  if (t.text) setPersonality(t.text);
                }}
              >
                {t.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving || !name.trim()}>
          {saving ? "Saving..." : "Save changes"}
        </Button>
        {saved && <span className="text-sm text-emerald-500">Saved!</span>}
        {saveError && <p className="text-sm text-destructive">{saveError}</p>}
      </div>
    </div>
  );
}

// --- Tab 2: Brain ---

function BrainTab({
  settings,
  botId,
  onUpdate,
}: {
  settings: BotSettings;
  botId: string;
  onUpdate: (s: BotSettings) => void;
}) {
  const { brain } = settings;
  const [modelInput, setModelInput] = useState(brain.model);
  const [changingMode, setChangingMode] = useState(false);
  const [brainError, setBrainError] = useState<string | null>(null);

  const saveModelFn = useCallback(
    async (payload: { model: string }) => {
      await updateBotBrain(botId, payload);
      onUpdate({
        ...settings,
        brain: { ...settings.brain, model: payload.model },
      });
    },
    [botId, settings, onUpdate],
  );

  const {
    enqueue: enqueueModelSave,
    saving: savingModel,
    error: modelSaveError,
  } = useSaveQueue(saveModelFn);

  useEffect(() => {
    if (modelSaveError) setBrainError(modelSaveError);
  }, [modelSaveError]);

  function handleSaveModel() {
    if (modelInput === brain.model) return;
    setBrainError(null);
    enqueueModelSave({ model: modelInput });
  }

  async function handleModeChange(mode: "hosted" | "byok") {
    if (mode === brain.mode) return;
    setChangingMode(true);
    setBrainError(null);
    try {
      await updateBotBrain(botId, { mode });
      onUpdate({
        ...settings,
        brain: { ...settings.brain, mode },
      });
    } catch {
      setBrainError("Failed to switch provider mode -- please try again.");
    } finally {
      setChangingMode(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-bold">Brain</h2>
        <p className="text-sm text-muted-foreground">Model and provider configuration.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Model</CardTitle>
          <CardDescription>
            LLM model ID (e.g. claude-sonnet-4, gpt-4o). Used via{" "}
            {brain.mode === "hosted" ? `${brandName()} Hosted` : "BYOK"}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Input
              value={modelInput}
              onChange={(e) => setModelInput(e.target.value)}
              placeholder="e.g. claude-sonnet-4"
              className="max-w-sm"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveModel}
              disabled={savingModel || modelInput === brain.model}
            >
              {savingModel ? "Saving..." : "Save"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Provider Mode</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup
            value={brain.mode}
            onValueChange={(v) => handleModeChange(v as "hosted" | "byok")}
            disabled={changingMode}
            className="space-y-2"
          >
            <div className="flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors hover:bg-accent/50">
              <RadioGroupItem value="hosted" id="mode-hosted" className="mt-1" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Label htmlFor="mode-hosted" className="text-sm font-medium cursor-pointer">
                    {brandName()} Hosted
                  </Label>
                  {brain.mode === "hosted" && <Badge variant="default">Active</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">
                  Everything routed through {brandName()}. Uses credits. No API keys needed.
                </p>
              </div>
            </div>

            <div className="flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors hover:bg-accent/50">
              <RadioGroupItem value="byok" id="mode-byok" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="mode-byok" className="text-sm font-medium cursor-pointer">
                  Bring Your Own Key
                </Label>
                <p className="text-sm text-muted-foreground">
                  Use your own Anthropic/OpenAI key. You pay the provider directly.
                </p>
                {brain.mode !== "byok" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => handleModeChange("byok")}
                    disabled={changingMode}
                  >
                    {changingMode ? "Switching..." : "Switch to BYOK"}
                  </Button>
                )}
              </div>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {brainError && <p className="text-sm text-destructive">{brainError}</p>}
    </div>
  );
}

// --- Tab 3: Channels ---

function ChannelsTab({
  settings,
  botId,
  onUpdate,
}: {
  settings: BotSettings;
  botId: string;
  onUpdate: () => void;
}) {
  const router = useRouter();
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [channelError, setChannelError] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState<string | null>(null);
  const [configuringChannel, setConfiguringChannel] = useState<BotChannel | null>(null);

  async function handleDisconnect(channelId: string) {
    setDisconnecting(channelId);
    setChannelError(null);
    try {
      await disconnectChannel(botId, channelId);
      setConfirmDisconnect(null);
      onUpdate();
    } catch {
      setChannelError("Failed to disconnect channel -- please try again.");
    } finally {
      setDisconnecting(null);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-bold">Channels</h2>
        <p className="text-sm text-muted-foreground">
          Connected channels and available integrations.
        </p>
      </div>

      <div className="space-y-3">
        {(settings.channels ?? []).map((ch) => (
          <Card key={ch.id}>
            <CardContent className="flex items-center justify-between p-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{ch.type}</span>
                  <ChannelStatusBadge status={ch.status} />
                </div>
                <p className="text-sm text-muted-foreground">
                  {ch.name} &middot; {ch.stats}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setConfiguringChannel(ch)}>
                  Configure
                </Button>
                {ch.status === "connected" && (
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDisconnect(ch.id)}>
                    Disconnect
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add More Channels</CardTitle>
          <CardDescription>
            Your {productName()} works everywhere you do. All channels are free.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {(settings.availableChannels ?? []).map((ch) => (
              <Button
                key={ch.type}
                variant="outline"
                onClick={() => router.push(`/channels/setup/${ch.type.toLowerCase()}?bot=${botId}`)}
              >
                + Add {ch.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {channelError && <p className="text-sm text-destructive">{channelError}</p>}

      {configuringChannel && (
        <ConfigureChannelDialog
          channel={configuringChannel}
          botId={botId}
          open={configuringChannel !== null}
          onOpenChange={(open) => {
            if (!open) setConfiguringChannel(null);
          }}
          onSaved={onUpdate}
        />
      )}

      <Dialog open={confirmDisconnect !== null} onOpenChange={() => setConfirmDisconnect(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect channel?</DialogTitle>
            <DialogDescription>
              This will remove the channel from your bot. You can reconnect it later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDisconnect(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmDisconnect && handleDisconnect(confirmDisconnect)}
              disabled={disconnecting !== null}
            >
              {disconnecting ? "Disconnecting..." : "Disconnect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// --- Channel status badge ---

function ChannelStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    connected: {
      label: "Connected",
      className: "bg-emerald-500/15 text-emerald-500 border-emerald-500/25",
    },
    disconnected: {
      label: "Disconnected",
      className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",
    },
    "always-on": {
      label: "Always On",
      className: "bg-blue-500/15 text-blue-500 border-blue-500/25",
    },
  };
  const c = config[status] ?? config.disconnected;
  return (
    <Badge variant="outline" className={c.className}>
      {c.label}
    </Badge>
  );
}

// --- Channel config dialog ---

function ConfigureChannelDialog({
  channel,
  botId,
  open,
  onOpenChange,
  onSaved,
}: {
  channel: BotChannel;
  botId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [config, setConfig] = useState<Record<string, string>>({});
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoadingConfig(true);
    setError(null);
    getChannelConfig(botId, channel.id)
      .then(setConfig)
      .catch(() => setError("Failed to load channel configuration."))
      .finally(() => setLoadingConfig(false));
  }, [open, botId, channel.id]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await updateChannelConfig(botId, channel.id, config);
      onSaved();
      onOpenChange(false);
    } catch {
      setError("Failed to save — please try again.");
    } finally {
      setSaving(false);
    }
  }

  function updateField(key: string, value: string) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configure {channel.type}</DialogTitle>
          <DialogDescription>Settings for {channel.name}</DialogDescription>
        </DialogHeader>
        {loadingConfig ? (
          <p className="text-sm text-muted-foreground">Loading configuration...</p>
        ) : (
          <div className="space-y-4">
            {Object.entries(config).map(([key, value]) => (
              <div key={key} className="space-y-2">
                <Label htmlFor={`channel-cfg-${key}`}>{key}</Label>
                <Input
                  id={`channel-cfg-${key}`}
                  value={value}
                  onChange={(e) => updateField(key, e.target.value)}
                />
              </div>
            ))}
            {Object.keys(config).length === 0 && !error && (
              <p className="text-sm text-muted-foreground">
                No configurable settings for this channel.
              </p>
            )}
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loadingConfig}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Tab 4: Superpowers ---

function SuperpowersTab({
  settings,
  botId,
  onUpdate,
}: {
  settings: BotSettings;
  botId: string;
  onUpdate: () => void;
}) {
  const [activating, setActivating] = useState<string | null>(null);
  const [activateError, setActivateError] = useState<string | null>(null);
  const [configuringSuperpower, setConfiguringSuperpower] = useState<ActiveSuperpower | null>(null);

  async function handleActivate(superpowerId: string) {
    setActivating(superpowerId);
    setActivateError(null);
    try {
      await activateSuperpower(botId, superpowerId);
      onUpdate();
    } catch {
      setActivateError("Failed to activate capability \u2014 please try again.");
    } finally {
      setActivating(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Superpowers</h2>
        <p className="text-sm text-muted-foreground">
          Capabilities that make your bot extraordinary.
        </p>
      </div>

      {/* Active superpowers */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Active
        </h3>
        {(settings.activeSuperpowers ?? []).map((sp) => (
          <ActiveSuperpowerCard
            key={sp.id}
            superpower={sp}
            onConfigure={() => setConfiguringSuperpower(sp)}
          />
        ))}
      </div>

      <Separator />

      {/* Available superpowers */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Your {productName()} can do more
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(settings.availableSuperpowers ?? []).map((sp) => (
            <AvailableSuperpowerCard
              key={sp.id}
              superpower={sp}
              activating={activating === sp.id}
              onActivate={() => handleActivate(sp.id)}
            />
          ))}
        </div>
        <p className="text-sm text-muted-foreground">One click to activate. Uses your credits.</p>
        {activateError && <p className="text-sm text-destructive">{activateError}</p>}
      </div>

      {configuringSuperpower && (
        <ConfigureSuperpowerDialog
          superpower={configuringSuperpower}
          botId={botId}
          open={configuringSuperpower !== null}
          onOpenChange={(open) => {
            if (!open) setConfiguringSuperpower(null);
          }}
          onSaved={onUpdate}
        />
      )}
    </div>
  );
}

function ConfigureSuperpowerDialog({
  superpower,
  botId,
  open,
  onOpenChange,
  onSaved,
}: {
  superpower: ActiveSuperpower;
  botId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [config, setConfig] = useState<Record<string, string>>({});
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoadingConfig(true);
    setError(null);
    getSuperpowerConfig(botId, superpower.id)
      .then(setConfig)
      .catch(() => setError("Failed to load superpower configuration."))
      .finally(() => setLoadingConfig(false));
  }, [open, botId, superpower.id]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await updateSuperpowerConfig(botId, superpower.id, config);
      onSaved();
      onOpenChange(false);
    } catch {
      setError("Failed to save — please try again.");
    } finally {
      setSaving(false);
    }
  }

  function updateField(key: string, value: string) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configure {superpower.name}</DialogTitle>
          <DialogDescription>
            Provider: {superpower.provider} · Model: {superpower.model}
          </DialogDescription>
        </DialogHeader>
        {loadingConfig ? (
          <p className="text-sm text-muted-foreground">Loading configuration...</p>
        ) : (
          <div className="space-y-4">
            {Object.entries(config).map(([key, value]) => (
              <div key={key} className="space-y-2">
                <Label htmlFor={`sp-cfg-${key}`}>{key}</Label>
                <Input
                  id={`sp-cfg-${key}`}
                  value={value}
                  onChange={(e) => updateField(key, e.target.value)}
                />
              </div>
            ))}
            {Object.keys(config).length === 0 && !error && (
              <p className="text-sm text-muted-foreground">
                No configurable settings for this superpower.
              </p>
            )}
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loadingConfig}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ActiveSuperpowerCard({
  superpower,
  onConfigure,
}: {
  superpower: ActiveSuperpower;
  onConfigure: () => void;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{superpower.name}</span>
            <Badge variant="outline">{superpower.mode === "hosted" ? "Hosted" : "BYOK"}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {superpower.usageCount} {superpower.usageLabel} &middot;{" "}
            <CreditDetailed value={superpower.spend} /> spent
          </p>
          <p className="text-xs text-muted-foreground">
            Provider: {superpower.provider} &middot; {superpower.model}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onConfigure}>
            Configure
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AvailableSuperpowerCard({
  superpower,
  activating,
  onActivate,
}: {
  superpower: AvailableSuperpower;
  activating: boolean;
  onActivate: () => void;
}) {
  return (
    <Card className="flex flex-col justify-between">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{superpower.name}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-3">
        <p className="text-sm text-muted-foreground">{superpower.description}</p>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">{superpower.pricing}</span>
          <Button size="sm" onClick={onActivate} disabled={activating}>
            {activating ? "Adding..." : "+ Add"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// --- Tab 5: Plugins ---

function PluginsTab({
  settings,
  botId,
  onUpdate,
}: {
  settings: BotSettings;
  botId: string;
  onUpdate: () => void;
}) {
  const [togglingPlugin, setTogglingPlugin] = useState<string | null>(null);
  const [installingPlugin, setInstallingPlugin] = useState<string | null>(null);
  const [pluginError, setPluginError] = useState<string | null>(null);
  const [configuringPlugin, setConfiguringPlugin] = useState<InstalledPlugin | null>(null);
  const [uninstallingPlugin, setUninstallingPlugin] = useState<string | null>(null);
  const [confirmUninstall, setConfirmUninstall] = useState<InstalledPlugin | null>(null);

  async function handleUninstall(pluginId: string) {
    setUninstallingPlugin(pluginId);
    setPluginError(null);
    try {
      await uninstallPlugin(botId, pluginId);
      onUpdate();
    } catch (err) {
      setPluginError(toUserMessage(err, "Failed to uninstall plugin -- please try again."));
    } finally {
      setUninstallingPlugin(null);
      setConfirmUninstall(null);
    }
  }

  async function handleToggle(pluginId: string, enabled: boolean) {
    setTogglingPlugin(pluginId);
    setPluginError(null);
    try {
      await togglePlugin(botId, pluginId, enabled);
      onUpdate();
    } catch {
      setPluginError(`Failed to ${enabled ? "enable" : "disable"} plugin -- please try again.`);
    } finally {
      setTogglingPlugin(null);
    }
  }

  async function handleInstall(pluginId: string) {
    setInstallingPlugin(pluginId);
    setPluginError(null);
    try {
      await installPlugin(botId, pluginId);
      onUpdate();
    } catch {
      setPluginError("Failed to install plugin -- please try again.");
    } finally {
      setInstallingPlugin(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Plugins</h2>
        <p className="text-sm text-muted-foreground">Installed plugins and plugin discovery.</p>
      </div>

      {/* Installed */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Installed
        </h3>
        {(settings.installedPlugins ?? []).map((plugin) => (
          <InstalledPluginCard
            key={plugin.id}
            plugin={plugin}
            onToggle={handleToggle}
            toggling={togglingPlugin === plugin.id}
            onConfigure={() => setConfiguringPlugin(plugin)}
            onUninstall={() => setConfirmUninstall(plugin)}
          />
        ))}
      </div>

      <Separator />

      {/* Discover */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Discover Plugins
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(settings.discoverPlugins ?? []).map((plugin) => (
            <DiscoverPluginCard
              key={plugin.id}
              plugin={plugin}
              onInstall={handleInstall}
              installing={installingPlugin === plugin.id}
            />
          ))}
        </div>
        <Button variant="outline" asChild>
          <Link href="/marketplace">Browse all plugins</Link>
        </Button>
      </div>

      {pluginError && <p className="text-sm text-destructive">{pluginError}</p>}

      {confirmUninstall && (
        <Dialog
          open={confirmUninstall !== null}
          onOpenChange={(open) => {
            if (!open) setConfirmUninstall(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Uninstall {confirmUninstall.name}?</DialogTitle>
              <DialogDescription>
                This will remove the plugin and its configuration from your bot. This action cannot
                be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmUninstall(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleUninstall(confirmUninstall.id)}
                disabled={uninstallingPlugin === confirmUninstall.id}
              >
                {uninstallingPlugin === confirmUninstall.id ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uninstalling...
                  </>
                ) : (
                  "Uninstall"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {configuringPlugin && (
        <ConfigurePluginDialog
          plugin={configuringPlugin}
          botId={botId}
          open={configuringPlugin !== null}
          onOpenChange={(open) => {
            if (!open) setConfiguringPlugin(null);
          }}
          onSaved={onUpdate}
        />
      )}
    </div>
  );
}

function ConfigurePluginDialog({
  plugin,
  botId,
  open,
  onOpenChange,
  onSaved,
}: {
  plugin: InstalledPlugin;
  botId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [config, setConfig] = useState<Record<string, string>>({});
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoadingConfig(true);
    setError(null);
    getPluginConfig(botId, plugin.id)
      .then(setConfig)
      .catch(() => setError("Failed to load plugin configuration."))
      .finally(() => setLoadingConfig(false));
  }, [open, botId, plugin.id]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await updatePluginConfig(botId, plugin.id, config);
      onSaved();
      onOpenChange(false);
    } catch {
      setError("Failed to save — please try again.");
    } finally {
      setSaving(false);
    }
  }

  function updateField(key: string, value: string) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configure {plugin.name}</DialogTitle>
          <DialogDescription>{plugin.description}</DialogDescription>
        </DialogHeader>
        {loadingConfig ? (
          <p className="text-sm text-muted-foreground">Loading configuration...</p>
        ) : (
          <div className="space-y-4">
            {Object.entries(config).map(([key, value]) => (
              <div key={key} className="space-y-2">
                <Label htmlFor={`plugin-cfg-${key}`}>{key}</Label>
                <Input
                  id={`plugin-cfg-${key}`}
                  value={value}
                  onChange={(e) => updateField(key, e.target.value)}
                />
              </div>
            ))}
            {Object.keys(config).length === 0 && !error && (
              <p className="text-sm text-muted-foreground">
                No configurable settings for this plugin.
              </p>
            )}
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loadingConfig}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InstalledPluginCard({
  plugin,
  onToggle,
  toggling,
  onConfigure,
  onUninstall,
}: {
  plugin: InstalledPlugin;
  onToggle: (pluginId: string, enabled: boolean) => void;
  toggling: boolean;
  onConfigure: () => void;
  onUninstall: () => void;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{plugin.name}</span>
            <Badge
              variant="outline"
              className={PLUGIN_STATUS_STYLES[plugin.status] ?? DEFAULT_STATUS_STYLE}
            >
              {plugin.status === "active" ? "Active" : "Disabled"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{plugin.description}</p>
          <p className="text-xs text-muted-foreground">Uses: {plugin.capabilities.join(", ")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onConfigure}>
            Configure
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onUninstall}
            title="Uninstall plugin"
            aria-label="Uninstall plugin"
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onToggle(plugin.id, plugin.status !== "active")}
            disabled={toggling}
          >
            {toggling ? "Updating..." : plugin.status === "active" ? "Disable" : "Enable"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DiscoverPluginCard({
  plugin,
  onInstall,
  installing,
}: {
  plugin: DiscoverPlugin;
  onInstall: (pluginId: string) => void;
  installing: boolean;
}) {
  return (
    <Card className="flex flex-col justify-between">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{plugin.name}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-3">
        <p className="text-sm text-muted-foreground">{plugin.description}</p>
        {plugin.needs.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {plugin.needs.map((n) => (
              <Badge key={n} variant="secondary" className="text-xs">
                Needs: {n}
              </Badge>
            ))}
          </div>
        )}
        <Button size="sm" onClick={() => onInstall(plugin.id)} disabled={installing}>
          {installing ? "Installing..." : "Install"}
        </Button>
      </CardContent>
    </Card>
  );
}

// --- Tab 6: Usage ---

function UsageTab({ settings }: { settings: BotSettings }) {
  const { usage } = settings;
  const denom = usage.totalSpend + usage.creditBalance;
  const spendPercent = denom > 0 ? (usage.totalSpend / denom) * 100 : 0;
  const balanceLow = denom > 0 && usage.creditBalance < denom * 0.2;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-bold">Usage -- {settings.identity.name}</h2>
        <p className="text-sm text-muted-foreground">Per-bot credit consumption breakdown.</p>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="text-sm text-muted-foreground">
            This week: {formatCreditStandard(usage.totalSpend)} of{" "}
            {formatCreditStandard(usage.creditBalance)} remaining credits
          </div>
          <Progress value={spendPercent} className="h-2" />
        </CardContent>
      </Card>

      {/* By Capability */}
      <Card>
        <CardHeader>
          <CardTitle>By Capability</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(usage?.capabilities ?? []).map((cap) => (
            <div key={cap.capability} className="flex items-center gap-3">
              <span className="w-24 text-sm font-medium">{cap.capability}</span>
              <div className="flex-1">
                <Progress value={cap.percent} className="h-2" />
              </div>
              <span className="w-16 text-right text-sm font-medium min-w-[7rem]">
                <CreditDetailed value={cap.spend} />
              </span>
              <span className="w-12 text-right text-xs text-muted-foreground">{cap.percent}%</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Trend */}
      <Card>
        <CardHeader>
          <CardTitle>Trend</CardTitle>
          <CardDescription>Daily spend over the last 14 days</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-24 items-end gap-1">
            {(usage?.trend ?? []).map((point) => {
              const maxSpend = Math.max(0, ...(usage?.trend ?? []).map((p) => p.spend));
              const height = maxSpend > 0 ? (point.spend / maxSpend) * 100 : 0;
              return (
                <div
                  key={point.date}
                  className="flex flex-1 flex-col items-center gap-1"
                  title={`${point.date}: ${formatCreditDetailed(point.spend)}`}
                >
                  <div
                    className="w-full rounded-t bg-primary/60"
                    style={{ height: `${height}%` }}
                  />
                  <span className="text-[10px] text-muted-foreground">{point.date.slice(-2)}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Top-up CTA */}
      {balanceLow && (
        <Card className="border-amber-500/25 bg-amber-500/5">
          <CardContent className="flex items-center justify-between p-4">
            <span className="text-sm font-medium">Running low on credits?</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" asChild>
                <Link href="/billing/credits">Top up -- $10</Link>
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link href="/billing/credits">$25</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/billing/credits">$50</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// --- Tab 7: Danger Zone ---

function DangerZoneTab({
  settings,
  botId,
  onUpdate,
}: {
  settings: BotSettings;
  botId: string;
  onUpdate: () => void;
}) {
  const router = useRouter();
  const [confirmAction, setConfirmAction] = useState<"stop" | "archive" | "delete" | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const botName = settings.identity.name;

  function handleDialogClose() {
    setConfirmAction(null);
    setActionError(null);
  }

  async function handleConfirm() {
    if (!confirmAction) return;
    if (confirmAction === "delete" && confirmText !== botName) return;
    setActing(true);
    setActionError(null);
    try {
      await controlBot(botId, confirmAction);
      if (confirmAction === "delete" || confirmAction === "archive") {
        router.push("/dashboard");
        return;
      }
      setConfirmAction(null);
      setConfirmText("");
      onUpdate();
    } catch {
      setActionError(`Failed to ${confirmAction} bot \u2014 please try again.`);
    } finally {
      setActing(false);
    }
  }

  const actions = [
    {
      key: "stop" as const,
      label: `Stop ${botName}`,
      description: "Pause this bot. Channels go offline. Can restart anytime.",
      variant: "outline" as const,
    },
    {
      key: "archive" as const,
      label: `Archive ${botName}`,
      description: "Remove from fleet. Keeps config and memories for 30 days. Can restore.",
      variant: "outline" as const,
    },
    {
      key: "delete" as const,
      label: `Delete ${botName}`,
      description: "Permanent. All data destroyed. This cannot be undone.",
      variant: "destructive" as const,
    },
  ];

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-destructive">Danger Zone</h2>
        <p className="text-sm text-muted-foreground">
          Irreversible and destructive actions. Proceed with caution.
        </p>
      </div>

      <div className="space-y-4">
        {actions.map((action) => (
          <Card key={action.key} className={action.key === "delete" ? "border-destructive/50" : ""}>
            <CardContent className="flex items-center justify-between p-4">
              <div className="space-y-1">
                <p className="text-sm font-medium">{action.description}</p>
              </div>
              <Button variant={action.variant} onClick={() => setConfirmAction(action.key)}>
                {action.label}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Confirmation dialog */}
      <Dialog open={confirmAction !== null} onOpenChange={handleDialogClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmAction === "stop" && `Stop ${botName}?`}
              {confirmAction === "archive" && `Archive ${botName}?`}
              {confirmAction === "delete" && `Delete ${botName} permanently?`}
            </DialogTitle>
            <DialogDescription>
              {confirmAction === "stop" &&
                "This will pause your bot. All channels will go offline. You can restart it at any time."}
              {confirmAction === "archive" &&
                "This will remove your bot from the fleet. Config and memories are kept for 30 days. You can restore it within that window."}
              {confirmAction === "delete" && (
                <>
                  This action is permanent and cannot be undone. All data, memories, and
                  configuration will be destroyed. Type{" "}
                  <strong className="text-foreground">{botName}</strong> to confirm.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {actionError && <p className="text-sm text-destructive">{actionError}</p>}

          {confirmAction === "delete" && (
            <Input
              placeholder={`Type "${botName}" to confirm`}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
            />
          )}

          <DialogFooter>
            <Button variant="outline" onClick={handleDialogClose}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirm}
              disabled={acting || (confirmAction === "delete" && confirmText !== botName)}
            >
              {acting
                ? "Processing..."
                : confirmAction === "stop"
                  ? "Stop bot"
                  : confirmAction === "archive"
                    ? "Archive bot"
                    : "Delete permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
