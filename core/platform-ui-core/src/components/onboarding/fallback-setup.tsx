"use client";

import { AlertTriangle } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { quickSetup } from "@/lib/api";
import { brandName } from "@/lib/brand-config";
import { markOnboardingComplete } from "@/lib/onboarding-store";

const CHANNELS = [
  { id: "discord", name: "Discord" },
  { id: "slack", name: "Slack" },
  { id: "telegram", name: "Telegram" },
  { id: "web-ui", name: "Web UI" },
] as const;

export function FallbackSetup() {
  const [apiKey, setApiKey] = useState("");
  const [channel, setChannel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      if (!apiKey.trim()) {
        setError("API key is required");
        return;
      }
      if (!channel) {
        setError("Select a channel");
        return;
      }

      setSubmitting(true);
      try {
        const res = await quickSetup(apiKey.trim(), channel);
        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: "Setup failed" }));
          setError((data as { error?: string }).error || "Setup failed");
          return;
        }
        markOnboardingComplete();
        window.location.reload();
      } catch {
        setError("Network error. Try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [apiKey, channel],
  );

  return (
    <div className="flex items-start justify-center pt-24 px-4">
      <Card className="w-full max-w-sm border-border bg-card">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="h-4 w-4 text-chart-3" />
            <h2 className="text-sm font-mono uppercase tracking-[0.2em] text-chart-3">
              MANUAL OVERRIDE
            </h2>
          </div>
          <p className="text-xs text-muted-foreground mb-6">
            Platform {brandName()} unavailable. Configure manually.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label
                htmlFor="fallback-api-key"
                className="text-xs uppercase tracking-wider text-muted-foreground"
              >
                API KEY
              </Label>
              <Input
                id="fallback-api-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="bg-secondary border-border font-mono text-sm placeholder:text-muted-foreground/40"
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="fallback-channel"
                className="text-xs uppercase tracking-wider text-muted-foreground"
              >
                CHANNEL
              </Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger
                  id="fallback-channel"
                  className="bg-secondary border-border font-mono text-sm"
                >
                  <SelectValue placeholder="Select channel" />
                </SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((ch) => (
                    <SelectItem key={ch.id} value={ch.id} className="font-mono text-sm">
                      {ch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <Button
              type="submit"
              disabled={submitting}
              className="w-full bg-terminal text-primary-foreground font-mono text-sm uppercase tracking-wider hover:bg-terminal-dim transition-all duration-150"
            >
              {submitting ? <span className="animate-ellipsis">INITIALIZING</span> : "INITIALIZE"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
