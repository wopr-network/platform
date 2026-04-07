import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../api/client";
import type { BotInstance } from "../types/bot";

interface TRPCBatchResponse {
  result?: {
    data?: {
      json?: { bots?: BotInstance[] };
    };
  };
  bots?: BotInstance[];
}

export function useBots() {
  const [bots, setBots] = useState<BotInstance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Use vanilla fetch to tRPC batch endpoint
      const res = await apiFetch("/trpc/fleet.listInstances", {
        method: "GET",
      });
      if (!res.ok) throw new Error(`Failed to fetch bots (${res.status})`);
      const data = (await res.json()) as TRPCBatchResponse;
      // tRPC batch response: { result: { data: { json: { bots: [...] } } } }
      const result = data?.result?.data?.json ?? (data as { bots?: BotInstance[] });
      setBots(result.bots ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load bots");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { bots, isLoading, error, refresh };
}
