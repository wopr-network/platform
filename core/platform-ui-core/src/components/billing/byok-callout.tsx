"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import type { InferenceMode } from "@/lib/api";
import { getInferenceMode } from "@/lib/api";
import { brandName } from "@/lib/brand-config";

export function ByokCallout({ compact }: { compact?: boolean }) {
  const [mode, setMode] = useState<InferenceMode | null>(null);

  useEffect(() => {
    getInferenceMode()
      .then(setMode)
      .catch(() => setMode("hosted"));
  }, []);

  if (mode === null) {
    return compact ? (
      <p className="text-xs text-muted-foreground">&nbsp;</p>
    ) : (
      <Card className="border-transparent bg-muted/30">
        <CardContent className="py-4">
          <div className="h-5" />
        </CardContent>
      </Card>
    );
  }

  if (mode === "hosted") {
    return <HostedCallout compact={compact} />;
  }

  if (compact) {
    return (
      <p className="text-xs text-muted-foreground">
        All plans are BYOK — you pay your AI provider directly. {brandName()} never touches your
        inference.
      </p>
    );
  }

  return (
    <Card className="border-emerald-500/25 bg-emerald-500/5">
      <CardContent className="flex items-start gap-3 py-4">
        <span className="mt-0.5 text-lg" aria-hidden="true">
          *
        </span>
        <div className="space-y-1">
          <p className="text-sm font-medium">Bring Your Own Keys</p>
          <p className="text-sm text-muted-foreground">
            All plans are BYOK — you pay your AI provider directly. {brandName()} never touches your
            inference. We only charge for the orchestration layer: containers, plugins, and support.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function HostedCallout({ compact }: { compact?: boolean }) {
  if (compact) {
    return (
      <p className="text-xs text-muted-foreground">
        Hosted adapter — transparent per-use pricing with no markup surprises. Switch to BYOK
        anytime in settings.
      </p>
    );
  }

  return (
    <Card className="border-blue-500/25 bg-blue-500/5">
      <CardContent className="flex items-start gap-3 py-4">
        <span className="mt-0.5 text-lg" aria-hidden="true">
          *
        </span>
        <div className="space-y-1">
          <p className="text-sm font-medium">Hosted AI Adapter</p>
          <p className="text-sm text-muted-foreground">
            BYOK users pay their providers directly. Hosted users pay per use — transparent pricing,
            no markup surprises. Each plan includes a monthly hosted credit.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
