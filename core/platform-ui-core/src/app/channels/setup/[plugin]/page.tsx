"use client";

import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { use, useEffect, useState } from "react";
import { toast } from "sonner";
import { Wizard } from "@/components/channel-wizard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { connectChannel } from "@/lib/api";
import { type ChannelManifest, getManifest } from "@/lib/channel-manifests";
import { toUserMessage } from "@/lib/errors";
import { logger } from "@/lib/logger";

const log = logger("channel-setup");

export default function ChannelSetupPage({ params }: { params: Promise<{ plugin: string }> }) {
  const { plugin } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const botId = searchParams.get("botId");
  const [manifest, setManifest] = useState<ChannelManifest | null>(null);
  const [loadingManifest, setLoadingManifest] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    getManifest(plugin)
      .then((m) => setManifest(m ?? null))
      .catch((err) => {
        log.error("Failed to load channel manifest:", err);
        toast.error("Failed to load channel setup. Please try again.");
        setLoadError(toUserMessage(err, "Failed to load channel configuration"));
      })
      .finally(() => setLoadingManifest(false));
  }, [plugin]);

  if (loadingManifest) {
    return (
      <div className="flex min-h-full items-center justify-center p-8">
        <div className="w-full max-w-xl space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="mx-auto w-full max-w-xl text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
            <AlertTriangle className="size-6 text-red-500" />
          </div>
          <h1 className="text-lg font-semibold uppercase tracking-wider">LOAD ERROR</h1>
          <p className="text-sm text-muted-foreground">{loadError}</p>
          <Button variant="terminal" onClick={() => window.location.reload()}>
            RETRY
          </Button>
        </div>
      </div>
    );
  }

  if (!manifest) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Channel Not Found</h1>
          <p className="mt-2 text-muted-foreground">
            No manifest found for &ldquo;{plugin}&rdquo;.
          </p>
        </div>
      </div>
    );
  }

  if (!botId) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="mx-auto w-full max-w-xl text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10">
            <AlertTriangle className="size-6 text-amber-500" />
          </div>
          <h1 className="text-lg font-semibold uppercase tracking-wider">NO INSTANCE CONTEXT</h1>
          <p className="text-sm text-muted-foreground">
            Channel setup requires a bot instance. Navigate to your instance and connect a channel
            from the Channels tab.
          </p>
          <Button variant="terminal" asChild>
            <Link href="/instances">VIEW INSTANCES</Link>
          </Button>
        </div>
      </div>
    );
  }

  async function handleComplete(values: Record<string, string>) {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await connectChannel(botId as string, plugin, values);
      router.push(`/instances/${botId}?tab=channels`);
    } catch (err) {
      setSubmitError(toUserMessage(err, "Failed to connect channel"));
    } finally {
      setSubmitting(false);
    }
  }

  function handleCancel() {
    router.push(`/instances/${botId}?tab=channels`);
  }

  return (
    <div className="flex min-h-full items-center justify-center p-8">
      <div className="w-full max-w-xl space-y-4">
        {submitError && (
          <div className="rounded-sm border border-red-500/25 bg-red-500/10 px-4 py-3 font-mono text-sm text-red-500">
            &gt; ERROR: {submitError}
          </div>
        )}
        <Wizard
          manifest={manifest}
          onComplete={handleComplete}
          onCancel={handleCancel}
          submitting={submitting}
          botId={botId ?? undefined}
        />
      </div>
    </div>
  );
}
