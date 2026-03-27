"use client";

import { CheckCircle, Copy, Server, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { VpsInfo } from "@/lib/api";
import { getVpsInfo } from "@/lib/api";

interface VpsPanelProps {
  botId: string;
}

export function VpsInfoPanel({ botId }: VpsPanelProps) {
  const [vps, setVps] = useState<VpsInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setError(false);
    setLoading(true);
    setVps(null);
    getVpsInfo(botId)
      .then((data) => setVps(data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [botId]);

  if (loading) return null;

  if (!vps) {
    if (!error) return null;
    return (
      <Card className="border-destructive/30">
        <CardContent className="flex items-center gap-2 py-4">
          <Server className="size-5 text-destructive" />
          <p className="text-sm text-destructive">
            Failed to load VPS info. Please try again later.
          </p>
        </CardContent>
      </Card>
    );
  }

  async function handleCopy() {
    if (!vps?.sshConnectionString) return;
    try {
      await navigator.clipboard.writeText(vps.sshConnectionString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard write may fail in some browser contexts
    }
  }

  const statusBadge =
    vps.status === "active" ? (
      <Badge variant="terminal" className="gap-1">
        <CheckCircle className="size-3" /> Active
      </Badge>
    ) : vps.status === "canceling" ? (
      <Badge variant="outline" className="gap-1 text-yellow-500 border-yellow-500/50">
        Canceling
      </Badge>
    ) : (
      <Badge variant="outline" className="gap-1 text-destructive border-destructive/50">
        <XCircle className="size-3" /> Canceled
      </Badge>
    );

  return (
    <Card className="border-terminal/30">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Server className="size-5 text-terminal" />
          <CardTitle className="text-lg">VPS</CardTitle>
          {statusBadge}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground">Hostname</p>
            <p className="font-mono font-medium">{vps.hostname ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Disk</p>
            <p className="font-medium">{vps.diskSizeGb} GB SSD</p>
          </div>
          <div>
            <p className="text-muted-foreground">Resources</p>
            <p className="font-medium">2 GB RAM / 2 vCPU</p>
          </div>
          <div>
            <p className="text-muted-foreground">Active since</p>
            <p className="font-medium">{new Date(vps.createdAt).toLocaleDateString()}</p>
          </div>
        </div>

        {vps.sshConnectionString && (
          <div>
            <p className="mb-1.5 text-sm text-muted-foreground">SSH connection</p>
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2">
              <code className="flex-1 truncate text-xs font-mono">{vps.sshConnectionString}</code>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                onClick={handleCopy}
                title="Copy SSH command"
              >
                {copied ? (
                  <CheckCircle className="size-4 text-terminal" />
                ) : (
                  <Copy className="size-4" />
                )}
              </Button>
            </div>
          </div>
        )}

        {!vps.sshConnectionString && vps.status === "active" && (
          <p className="text-sm text-muted-foreground">
            SSH access is being provisioned. Check back shortly.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
