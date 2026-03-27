"use client";

import { Loader2, RefreshCw, Rocket } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc";

/* ------------------------------------------------------------------ */
/*  Types (cast from AnyTRPCQueryProcedure stubs)                      */
/* ------------------------------------------------------------------ */

interface RolloutStatus {
  isRolling: boolean;
  startedAt?: string;
  progress?: number;
}

interface TenantConfig {
  tenantId: string;
  mode: "auto" | "manual";
  preferredHourUtc: number;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/*  Rollout Status Card                                                */
/* ------------------------------------------------------------------ */

function RolloutStatusCard() {
  const utils = trpc.useUtils();

  const statusQuery = trpc.adminFleetUpdate.rolloutStatus.useQuery(undefined, {
    refetchInterval: 10_000,
  });

  const forceRolloutMutation = trpc.adminFleetUpdate.forceRollout.useMutation({
    onSuccess: () => {
      toast.success("Force rollout initiated.");
      utils.adminFleetUpdate.rolloutStatus.invalidate();
    },
    onError: (err) => {
      toast.error(`Force rollout failed: ${err.message}`);
    },
  });

  // NOTE: Cast needed because trpc-types.ts uses AnyTRPCQueryProcedure stubs
  // that erase return types. Remove when @wopr-network/sdk is published.
  const status = statusQuery.data as RolloutStatus | undefined;
  const isRolling = status?.isRolling ?? false;

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-mono">Rollout Status</CardTitle>
            <CardDescription className="text-xs">
              Current fleet update rollout state. Auto-refreshes every 10s.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => statusQuery.refetch()}
            disabled={statusQuery.isFetching}
            className="font-mono text-xs"
          >
            <RefreshCw size={12} className={statusQuery.isFetching ? "animate-spin" : ""} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {statusQuery.isLoading ? (
          <div className="flex items-center gap-4">
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-8 w-32" />
          </div>
        ) : statusQuery.isError ? (
          <p className="text-sm text-destructive font-mono">Failed to load rollout status.</p>
        ) : (
          <div className="flex items-center gap-4">
            <Badge
              variant="outline"
              className={
                isRolling
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                  : "border-terminal/30 bg-terminal/10 text-terminal"
              }
            >
              {isRolling ? "Rolling" : "Idle"}
            </Badge>
            {isRolling && status?.progress != null && (
              <span className="text-xs text-muted-foreground font-mono tabular-nums">
                {Math.round(status.progress * 100)}% complete
              </span>
            )}
            <Button
              type="button"
              size="sm"
              onClick={() => forceRolloutMutation.mutate(undefined)}
              disabled={forceRolloutMutation.isPending || isRolling}
              className="font-mono text-xs ml-auto"
            >
              {forceRolloutMutation.isPending ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Rocket size={12} />
              )}
              Force Rollout
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Tenant Config Row                                                  */
/* ------------------------------------------------------------------ */

function TenantConfigRow({
  config,
  onModeChanged,
}: {
  config: TenantConfig;
  onModeChanged: () => void;
}) {
  const setConfigMutation = trpc.adminFleetUpdate.setTenantConfig.useMutation({
    onSuccess: () => {
      toast.success(`Tenant ${config.tenantId} config updated.`);
      onModeChanged();
    },
    onError: (err) => {
      toast.error(`Failed to update config: ${err.message}`);
    },
  });

  function handleModeChange(newMode: string) {
    setConfigMutation.mutate({
      tenantId: config.tenantId,
      mode: newMode as "auto" | "manual",
    });
  }

  return (
    <TableRow>
      <TableCell>
        <code className="text-xs text-muted-foreground">{config.tenantId}</code>
      </TableCell>
      <TableCell>
        <Select
          value={config.mode}
          onValueChange={handleModeChange}
          disabled={setConfigMutation.isPending}
        >
          <SelectTrigger className="h-7 w-28 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto" className="text-xs">
              auto
            </SelectItem>
            <SelectItem value="manual" className="text-xs">
              manual
            </SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <span className="text-sm text-muted-foreground font-mono tabular-nums">
          {String(config.preferredHourUtc).padStart(2, "0")}:00 UTC
        </span>
      </TableCell>
      <TableCell>
        <span className="text-xs text-muted-foreground">
          {new Date(config.updatedAt).toLocaleDateString()}
        </span>
      </TableCell>
    </TableRow>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function FleetUpdatesClient() {
  const utils = trpc.useUtils();

  const configsQuery = trpc.adminFleetUpdate.listTenantConfigs.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  // NOTE: Cast needed because trpc-types.ts uses AnyTRPCQueryProcedure stubs
  // that erase return types. Remove when @wopr-network/sdk is published.
  const configs = (configsQuery.data ?? []) as TenantConfig[];

  function handleConfigChanged() {
    utils.adminFleetUpdate.listTenantConfigs.invalidate();
  }

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-6 pb-2">
        <h1 className="text-lg font-bold text-terminal">
          <span className="text-muted-foreground">&gt;</span> Fleet Updates
        </h1>
      </div>

      {/* Rollout Status */}
      <div className="px-6">
        <RolloutStatusCard />
      </div>

      {/* Tenant Configs Table */}
      <div className="mx-6 bg-card border border-border rounded-sm">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            Tenant Update Configs
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => configsQuery.refetch()}
            disabled={configsQuery.isFetching}
            className="font-mono text-xs"
          >
            <RefreshCw size={12} className={configsQuery.isFetching ? "animate-spin" : ""} />
            Refresh
          </Button>
        </div>

        {configsQuery.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }, (_, i) => `sk-cfg-${i}`).map((k) => (
              <Skeleton key={k} className="h-12 rounded-md" />
            ))}
          </div>
        ) : configsQuery.isError ? (
          <div className="flex h-40 flex-col items-center justify-center gap-3">
            <p className="text-sm text-destructive font-mono">Failed to load tenant configs.</p>
            <Button variant="outline" size="sm" onClick={() => configsQuery.refetch()}>
              Retry
            </Button>
          </div>
        ) : (
          <div className="rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="text-xs uppercase tracking-wider">Tenant ID</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">Mode</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">
                    Preferred Hour (UTC)
                  </TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">Last Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configs.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center text-muted-foreground py-8 text-sm font-mono"
                    >
                      &gt; No tenant configs found.
                    </TableCell>
                  </TableRow>
                ) : (
                  configs.map((cfg) => (
                    <TenantConfigRow
                      key={cfg.tenantId}
                      config={cfg}
                      onModeChanged={handleConfigChanged}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
