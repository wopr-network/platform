"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Check, Download, Terminal } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { InstallWizard } from "@/components/marketplace/install-wizard";
import { SuperpowerContent } from "@/components/marketplace/superpower-content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { brandName } from "@/lib/brand-config";
import { toUserMessage } from "@/lib/errors";
import {
  formatInstallCount,
  getCapabilityColor,
  getHostedAdaptersForCapabilities,
  getMarketplacePlugin,
  getPluginContent,
  hasHostedOption,
  installPlugin,
  type PluginContentResponse,
  type PluginManifest,
} from "@/lib/marketplace-data";

// Terminal log simulation for install flow
export function TerminalLog({ plugin, onDone }: { plugin: PluginManifest; onDone: () => void }) {
  const [lines, setLines] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const logLines = useRef([
    `$ ${brandName().toLowerCase()} plugin install ${plugin.id}`,
    `Resolving ${plugin.name} v${plugin.version}...`,
    "Checking dependencies...",
    ...(plugin.requires.length > 0
      ? plugin.requires.map((r) => `  \u2713 ${r.label} satisfied`)
      : ["  \u2713 No additional dependencies"]),
    "Downloading plugin manifest...",
    "Verifying checksums...",
    `Installing ${plugin.name}...`,
    `Registering capabilities: ${plugin.capabilities.join(", ")}`,
    "Running post-install hooks...",
    `\u2713 ${plugin.name} installed successfully`,
  ]).current;

  useEffect(() => {
    let i = 0;
    let doneTimeout: ReturnType<typeof setTimeout> | null = null;
    const interval = setInterval(() => {
      if (i < logLines.length) {
        setLines((prev) => [...prev, logLines[i]]);
        i++;
        if (containerRef.current) {
          containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
      } else {
        clearInterval(interval);
        doneTimeout = setTimeout(() => onDoneRef.current(), 800);
      }
    }, 300);
    return () => {
      clearInterval(interval);
      if (doneTimeout) clearTimeout(doneTimeout);
    };
  }, [logLines]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-sm border border-primary/30 bg-black/50 p-4 font-mono text-xs"
    >
      <div className="mb-2 flex items-center gap-2 text-primary/60">
        <Terminal className="h-3.5 w-3.5" />
        <span>{brandName().toLowerCase()}-install</span>
      </div>
      <div ref={containerRef} className="max-h-48 overflow-y-auto space-y-1">
        {lines.map((line, idx) => (
          <motion.div
            key={`line-${idx}-${line.slice(0, 10)}`}
            initial={{ opacity: 0, x: -5 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.15 }}
            className={
              line.startsWith("\u2713") || line.startsWith("  \u2713")
                ? "text-emerald-400"
                : line.startsWith("$")
                  ? "text-primary"
                  : "text-muted-foreground"
            }
          >
            {line}
          </motion.div>
        ))}
        {lines.length < logLines.length && (
          <motion.span
            className="text-primary"
            animate={{ opacity: [1, 1, 0, 0] }}
            transition={{
              duration: 1.06,
              repeat: Infinity,
              times: [0, 0.49, 0.5, 1],
              ease: "linear",
            }}
          >
            _
          </motion.span>
        )}
      </div>
    </motion.div>
  );
}

export default function PluginDetailPage() {
  const params = useParams();
  const router = useRouter();
  const pluginId = params.plugin as string;

  const queryClient = useQueryClient();
  const [plugin, setPlugin] = useState<PluginManifest | null>(null);
  const [content, setContent] = useState<PluginContentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [showTerminalLog, setShowTerminalLog] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getMarketplacePlugin(pluginId);
      setPlugin(data);
      const contentData = await getPluginContent(pluginId);
      setContent(contentData);
    } catch (err) {
      setLoadError(toUserMessage(err, "Failed to load plugin"));
    } finally {
      setLoading(false);
    }
  }, [pluginId]);

  useEffect(() => {
    load();
  }, [load]);

  const [installError, setInstallError] = useState<string | null>(null);

  async function handleInstallComplete(botId: string, config: Record<string, unknown>) {
    if (!plugin) return;
    setInstallError(null);
    try {
      const providerChoices = (config._providerChoices as Record<string, string>) ?? {};
      const primaryProviderOverrides =
        (config._primaryProviderOverrides as Record<string, string>) ?? undefined;
      const { _providerChoices: _, _primaryProviderOverrides: __, ...pluginConfig } = config;
      const result = await installPlugin(
        plugin.id,
        botId,
        pluginConfig,
        providerChoices,
        primaryProviderOverrides,
      );
      if (!result.dispatched) {
        if (result.dispatchError === "bot_not_deployed") {
          toast.warning("Bot isn't running — plugin will activate on next start");
        } else {
          toast.warning("Couldn't reach bot — plugin saved and will activate on restart");
        }
      }
      setInstalling(false);
      // Invalidate all queries so navigation to /plugins shows fresh installed list
      queryClient.invalidateQueries();
      setShowTerminalLog(true);
    } catch (err) {
      setInstalling(false);
      setInstallError(toUserMessage(err, "Installation failed"));
    }
  }

  function handleTerminalDone() {
    setShowTerminalLog(false);
    router.push("/instances");
  }

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-36" />
        <div className="space-y-3">
          <Skeleton className="h-10 w-96" />
          <Skeleton className="h-5 w-full max-w-lg" />
        </div>
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-6 text-center space-y-4">
        <p className="text-sm text-red-500">{loadError}</p>
        <Button variant="outline" onClick={load}>
          Retry
        </Button>
        <Button variant="ghost" onClick={() => router.push("/marketplace")}>
          Back to Marketplace
        </Button>
      </div>
    );
  }

  if (!plugin) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Plugin not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push("/marketplace")}>
          Back to Marketplace
        </Button>
      </div>
    );
  }

  if (installing) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <InstallWizard
          plugin={plugin}
          onComplete={handleInstallComplete}
          onCancel={() => setInstalling(false)}
        />
      </div>
    );
  }

  const hostedAvailable = hasHostedOption(plugin.capabilities);
  const hostedAdapters = getHostedAdaptersForCapabilities(plugin.capabilities);
  const hasSuperpowerData = plugin.superpowerHeadline || plugin.superpowerTagline;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="p-6 space-y-6"
    >
      <Button
        data-onboarding-id="marketplace.back"
        variant="ghost"
        onClick={() => router.push("/marketplace")}
        className="mb-2 gap-2"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Superpowers
      </Button>

      {/* Outcome-first Hero Section */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="space-y-4"
      >
        {/* Large plugin icon with breathing glow */}
        <motion.div
          className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl text-2xl font-bold text-white"
          style={{ backgroundColor: plugin.color }}
          animate={{
            boxShadow: [
              `0 0 0px 0px ${plugin.color}00`,
              `0 0 20px 6px ${plugin.color}30`,
              `0 0 0px 0px ${plugin.color}00`,
            ],
          }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        >
          {plugin.name[0]}
        </motion.div>

        {/* H1 -- the outcome headline */}
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {hasSuperpowerData ? plugin.superpowerHeadline : plugin.name}
        </h1>

        {/* Tagline */}
        <p className="max-w-lg text-lg text-muted-foreground">
          {hasSuperpowerData ? plugin.superpowerTagline : plugin.description}
        </p>

        {/* CTA -- above the fold */}
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <Button
            data-onboarding-id={`marketplace.install.${plugin.id}`}
            size="lg"
            onClick={() => setInstalling(true)}
            className="gap-2 min-w-[280px]"
          >
            <Download className="h-4 w-4" />
            Give my bot this superpower
          </Button>
        </motion.div>
      </motion.div>

      {/* Terminal log animation */}
      <AnimatePresence>
        {showTerminalLog && <TerminalLog plugin={plugin} onDone={handleTerminalDone} />}
      </AnimatePresence>
      {installError && (
        <p className="text-sm text-red-500 rounded-sm border border-red-500/30 bg-red-500/10 px-3 py-2">
          {installError}
        </p>
      )}

      {/* Outcome bullets */}
      {plugin.superpowerOutcomes && plugin.superpowerOutcomes.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="space-y-2"
        >
          <h2 className="text-base font-bold">What she can do</h2>
          <ul className="space-y-2">
            {plugin.superpowerOutcomes.map((outcome) => (
              <li key={outcome} className="flex items-start gap-2 text-sm text-muted-foreground">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{outcome}</span>
              </li>
            ))}
          </ul>
        </motion.div>
      )}

      {/* Capability badges */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="flex flex-wrap gap-2"
      >
        {plugin.capabilities.map((cap) => {
          const color = getCapabilityColor(cap);
          return (
            <Badge
              key={cap}
              variant="outline"
              className={`${color.bg} ${color.text} ${color.border}`}
            >
              {cap}
            </Badge>
          );
        })}
        {hostedAvailable && (
          <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/25">
            {brandName()} Hosted
          </Badge>
        )}
      </motion.div>

      {/* What gets installed -- Tabs section (collapsed feel) */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">What gets installed</TabsTrigger>
          <TabsTrigger value="config">Configuration</TabsTrigger>
          <TabsTrigger value="changelog">Changelog</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 pt-4">
          {content && (
            <Card>
              <CardContent className="pt-6">
                <SuperpowerContent markdown={content.markdown} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Requirements</CardTitle>
              <CardDescription>Dependencies needed for this plugin.</CardDescription>
            </CardHeader>
            <CardContent>
              {plugin.requires.length === 0 ? (
                <p className="text-sm text-emerald-500">No additional dependencies required.</p>
              ) : (
                <ul className="space-y-2">
                  {plugin.requires.map((req) => (
                    <li key={req.id} className="flex items-center gap-2 text-sm">
                      <span className="text-emerald-500">&#10003;</span>
                      <span>{req.label}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {req.id}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {hostedAdapters.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{brandName()} Hosted Options</CardTitle>
                <CardDescription>
                  Capabilities available as managed services -- no keys needed.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {hostedAdapters.map((adapter) => (
                    <li
                      key={adapter.capability}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div>
                        <p className="text-sm font-medium">{adapter.label}</p>
                        <p className="text-xs text-muted-foreground">{adapter.description}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px]">
                        {adapter.pricing}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Setup Steps</CardTitle>
              <CardDescription>What happens during installation.</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2">
                {plugin.setup.map((step, i) => (
                  <li key={step.id} className="flex gap-3 text-sm">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                      {i + 1}
                    </span>
                    <div>
                      <p className="font-medium">{step.title}</p>
                      <p className="text-xs text-muted-foreground">{step.description}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          {/* Technical details -- version, author, installs */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>v{plugin.version}</span>
            <span className="text-border">|</span>
            <span>{formatInstallCount(plugin.installCount)} installs</span>
            <span className="text-border">|</span>
            <span>by {plugin.author}</span>
          </div>
        </TabsContent>

        <TabsContent value="config" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Configuration Schema</CardTitle>
              <CardDescription>
                Fields auto-generated from the plugin manifest. These will be filled during
                installation.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {plugin.configSchema.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  This plugin has no configuration fields.
                </p>
              ) : (
                <div className="space-y-3">
                  {plugin.configSchema.map((field) => (
                    <div key={field.key} className="rounded-lg border p-3">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{field.label}</p>
                        <Badge variant="outline" className="text-[10px]">
                          {field.type}
                        </Badge>
                        {field.required && (
                          <Badge
                            variant="outline"
                            className="text-[10px] border-red-500/25 text-red-500"
                          >
                            required
                          </Badge>
                        )}
                        {field.secret && (
                          <Badge
                            variant="outline"
                            className="text-[10px] border-yellow-500/25 text-yellow-500"
                          >
                            secret
                          </Badge>
                        )}
                      </div>
                      {field.description && (
                        <p className="mt-1 text-xs text-muted-foreground">{field.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="changelog" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Version History</CardTitle>
            </CardHeader>
            <CardContent>
              {plugin.changelog.length === 0 ? (
                <p className="text-sm text-muted-foreground">No changelog entries.</p>
              ) : (
                <div className="space-y-4">
                  {plugin.changelog.map((entry) => (
                    <div key={entry.version} className="flex gap-3">
                      <Badge variant="secondary" className="shrink-0">
                        v{entry.version}
                      </Badge>
                      <div>
                        <p className="text-sm">{entry.notes}</p>
                        <p className="text-xs text-muted-foreground">{entry.date}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
