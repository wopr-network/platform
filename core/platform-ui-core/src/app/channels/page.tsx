"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Instance } from "@/lib/api";
import { listInstances } from "@/lib/api";
import { getBrandConfig } from "@/lib/brand-config";
import { type ChannelManifest, getChannelManifests } from "@/lib/channel-manifests";
import { toUserMessage } from "@/lib/errors";

const staggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
} as const;

const staggerItem = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: "easeOut" as const },
  },
} as const;

export default function ChannelsPage() {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [channelManifests, setChannelManifests] = useState<ChannelManifest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: retryKey is an intentional trigger, not a value used inside the effect
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    async function load() {
      try {
        const [data, manifests] = await Promise.all([listInstances(), getChannelManifests()]);
        if (!cancelled) {
          setInstances(data);
          setChannelManifests(manifests);
        }
      } catch (err) {
        if (!cancelled) setError(toUserMessage(err, "Failed to load instances"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [retryKey]);

  const connectedPluginIds = new Set(instances.flatMap((inst) => inst.channels));

  const singleBotId = instances.length === 1 ? instances[0].id : null;

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-widest uppercase">COMMS CHANNELS</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect messaging platforms to your {getBrandConfig().productName}. Each channel is driven
          by a plugin manifest.
        </p>
      </div>

      {loading && (
        <section className="mb-10">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-terminal">
            LINKED
          </h2>
          <p className="mb-4 font-mono text-sm text-terminal/60">
            &gt; QUERYING CHANNEL STATUS...
            <span className="animate-[pulse-dot_1s_step-end_infinite]">_</span>
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => `skel-${i}`).map((key) => (
              <Card key={key} className="border-terminal/20">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-lg" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-3 w-40" />
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {error && (
        <div className="mb-6 space-y-3">
          <div className="rounded-sm border border-red-500/25 bg-red-500/10 px-4 py-3 font-mono text-sm text-red-500">
            &gt; CHANNEL QUERY FAILED: {error}
          </div>
          <Button
            variant="terminal"
            size="sm"
            onClick={() => {
              setError(null);
              setRetryKey((k) => k + 1);
            }}
          >
            RETRY
          </Button>
        </div>
      )}

      {!loading && !error && (
        <>
          <section className="mb-10">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-terminal">
              LINKED
            </h2>
            {instances.some((inst) => inst.channels.length > 0) ? (
              <motion.div
                variants={staggerContainer}
                initial="hidden"
                animate="show"
                className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
              >
                {instances
                  .filter((inst) => inst.channels.length > 0)
                  .flatMap((inst) =>
                    inst.channels.map((channelId) => {
                      const manifest = channelManifests.find((m) => m.id === channelId);
                      if (!manifest) return null;
                      return (
                        <motion.div key={`${inst.id}-${channelId}`} variants={staggerItem}>
                          <Card className="border-terminal/20 shadow-[0_0_6px_rgba(0,255,65,0.08)] transition-colors">
                            <CardHeader>
                              <div className="flex items-center gap-3">
                                <motion.div
                                  className="flex h-10 w-10 items-center justify-center rounded-lg text-lg font-bold text-white"
                                  style={{ backgroundColor: manifest.color }}
                                  whileHover={{
                                    scale: 1.15,
                                    rotate: [0, -5, 5, 0],
                                  }}
                                  transition={{ duration: 0.4 }}
                                >
                                  {manifest.name[0]}
                                </motion.div>
                                <div>
                                  <CardTitle className="flex items-center gap-2">
                                    {manifest.name}
                                    <Badge variant="terminal" className="gap-1.5">
                                      <span className="size-1.5 rounded-full bg-emerald-500 animate-[pulse-dot_2s_ease-in-out_infinite]" />
                                      Connected
                                    </Badge>
                                  </CardTitle>
                                  <CardDescription>{inst.name}</CardDescription>
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent>
                              <Button variant="ghost" size="sm" asChild>
                                <Link href={`/instances/${inst.id}?tab=channels`}>
                                  View Details
                                </Link>
                              </Button>
                            </CardContent>
                          </Card>
                        </motion.div>
                      );
                    }),
                  )
                  .filter(Boolean)}
              </motion.div>
            ) : (
              <div className="flex h-40 items-center justify-center rounded-sm border border-dashed border-terminal/20">
                <p className="font-mono text-sm text-terminal/60">
                  &gt; NO CHANNELS LINKED. YOUR BOT IS ISOLATED.
                </p>
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              AVAILABLE
            </h2>
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="show"
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            >
              {channelManifests
                .filter((m) => !connectedPluginIds.has(m.id))
                .map((manifest) => (
                  <motion.div key={manifest.id} variants={staggerItem}>
                    <motion.div
                      whileHover={{ y: -4, scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      transition={{
                        type: "spring",
                        stiffness: 400,
                        damping: 25,
                      }}
                    >
                      <Card className="flex flex-col transition-colors hover:border-terminal/30">
                        <CardHeader>
                          <div className="flex items-center gap-3">
                            <motion.div
                              className="flex h-10 w-10 items-center justify-center rounded-lg text-lg font-bold text-white"
                              style={{ backgroundColor: manifest.color }}
                              whileHover={{
                                scale: 1.15,
                                rotate: [0, -5, 5, 0],
                              }}
                              transition={{ duration: 0.4 }}
                            >
                              {manifest.name[0]}
                            </motion.div>
                            <div>
                              <CardTitle>{manifest.name}</CardTitle>
                              <CardDescription>{manifest.description}</CardDescription>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="mt-auto">
                          {singleBotId ? (
                            <Button variant="terminal" className="w-full" asChild>
                              <Link href={`/channels/setup/${manifest.id}?botId=${singleBotId}`}>
                                Connect
                              </Link>
                            </Button>
                          ) : instances.length > 1 ? (
                            <Button variant="terminal" className="w-full" asChild>
                              <Link href="/instances">Select Instance to Connect</Link>
                            </Button>
                          ) : (
                            <Button variant="terminal" className="w-full" disabled>
                              Create an Instance First
                            </Button>
                          )}
                        </CardContent>
                      </Card>
                    </motion.div>
                  </motion.div>
                ))}
            </motion.div>
          </section>
        </>
      )}
    </div>
  );
}
