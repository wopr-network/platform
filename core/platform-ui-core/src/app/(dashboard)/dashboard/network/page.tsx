"use client";

import { useEffect, useState } from "react";
import { FriendsTab } from "@/components/instances/friends-tab";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { Instance } from "@/lib/api";
import { listInstances } from "@/lib/api";
import { productName } from "@/lib/brand-config";
import { toUserMessage } from "@/lib/errors";

export default function NetworkPage() {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listInstances()
      .then((data) => {
        if (!cancelled) {
          setInstances(data);
          if (data.length === 1) {
            setSelectedInstanceId(data[0].id);
          }
        }
      })
      .catch((err) => {
        if (!cancelled) setError(toUserMessage(err, "Failed to load instances"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="p-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-widest uppercase">Friends &amp; Network</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage P2P connections, friend requests, and auto-accept rules for your {productName()}{" "}
            bot instances.
          </p>
        </div>
        <div className="w-full sm:w-56 shrink-0">
          {loading ? (
            <Skeleton className="h-9 w-full" />
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : instances.length === 0 ? (
            <p className="text-sm text-muted-foreground">No instances found.</p>
          ) : (
            <Select
              value={selectedInstanceId ?? ""}
              onValueChange={(v) => setSelectedInstanceId(v)}
            >
              <SelectTrigger className="w-full" aria-label="Select instance">
                <SelectValue placeholder="Select instance..." />
              </SelectTrigger>
              <SelectContent>
                {instances.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>
                    {inst.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {!loading && !error && !selectedInstanceId && instances.length > 0 && (
        <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-sm border border-dashed border-terminal/20">
          <p className="font-mono text-sm text-terminal/60">
            &gt; SELECT AN INSTANCE TO MANAGE FRIENDS
          </p>
        </div>
      )}

      {selectedInstanceId && (
        <FriendsTab key={selectedInstanceId} instanceId={selectedInstanceId} />
      )}
    </div>
  );
}
