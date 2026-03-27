"use client";

import { useEffect, useRef } from "react";
import { PLATFORM_BASE_URL } from "@/lib/api-config";
import { getActiveTenantId } from "@/lib/tenant-context";

export interface FleetSSEEvent {
  type: "bot.started" | "bot.stopped" | "bot.created" | "bot.removed" | "bot.restarted";
  botId: string;
  timestamp: string;
}

/**
 * Subscribe to real-time fleet events via SSE.
 * EventSource sends session cookies automatically (withCredentials: true).
 * Tenant ID is passed as a query parameter (EventSource cannot send headers).
 */
export function useFleetSSE(onEvent: (event: FleetSSEEvent) => void): void {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (typeof window === "undefined") return;

    const tenantId = getActiveTenantId();
    const url = new URL(`${PLATFORM_BASE_URL}/fleet/events`);
    if (tenantId) url.searchParams.set("tenantId", tenantId);

    const es = new EventSource(url.toString(), { withCredentials: true });

    function handleFleetEvent(e: MessageEvent) {
      try {
        const data = JSON.parse(e.data) as FleetSSEEvent;
        onEventRef.current(data);
      } catch (_err) {
        // Malformed event — ignore
      }
    }

    es.addEventListener("fleet", handleFleetEvent);

    return () => {
      es.removeEventListener("fleet", handleFleetEvent);
      es.close();
    };
  }, []);
}
