"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { controlInstance, type InstanceVersionCheck, instanceVersionCheck, listInstances } from "@/lib/api";

type Status = "idle" | "rolling" | "done";

/**
 * Banner that appears when the user's sidecar container is running an
 * older image than the one currently pulled on the host node. Offers an
 * opt-in "Update now" button that triggers a fleet.controlInstance roll.
 *
 * Polls every 60s. During roll the banner shows "Updating…" and expects
 * a brief iframe/sidebar reconnect; on success it reloads the page so
 * the fresh container serves the iframe from its new image.
 */
export function InstanceUpdateBanner() {
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [check, setCheck] = useState<InstanceVersionCheck | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [dismissed, setDismissed] = useState(false);
  const reloadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    listInstances()
      .then((instances) => {
        // The hosted shell currently provisions exactly one sidecar per
        // user, so instances[0] is the workspace the shell is backing.
        // If multi-instance support lands, this needs a way to pick the
        // active instance (e.g. product slug or a dedicated endpoint).
        if (!cancelled) setInstanceId(instances[0]?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setInstanceId(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Clear any in-flight reload timer if the component unmounts, to avoid
  // a setState on an unmounted component and a surprise reload firing
  // after navigation.
  useEffect(() => {
    return () => {
      if (reloadTimeoutRef.current) {
        clearTimeout(reloadTimeoutRef.current);
        reloadTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!instanceId) return;
    let cancelled = false;
    async function poll() {
      if (!instanceId) return;
      try {
        const result = await instanceVersionCheck(instanceId);
        if (!cancelled) setCheck(result);
      } catch {
        // Transient errors are fine — we'll retry on the next tick.
      }
    }
    void poll();
    const handle = window.setInterval(poll, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(handle);
    };
  }, [instanceId]);

  const onUpdate = useCallback(async () => {
    if (!instanceId) return;
    setStatus("rolling");
    try {
      await controlInstance(instanceId, "roll");
      // Give the container ~25s to come back up before reloading. A tighter
      // loop that polls health would be nicer, but reload is simpler and
      // matches how the shell already recovers from routeChanged.
      reloadTimeoutRef.current = setTimeout(() => {
        setStatus("done");
        window.location.reload();
      }, 25_000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Update failed: ${msg}`);
      setStatus("idle");
    }
  }, [instanceId]);

  if (dismissed) return null;
  if (!check) return null;
  if (check.upToDate) return null;

  return (
    <div className="flex items-center gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-100">
      <span className="font-medium">New version available</span>
      <span className="text-amber-100/70">Your workspace will briefly disconnect while we swap it in.</span>
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onUpdate}
          disabled={status !== "idle"}
          className="rounded-md bg-amber-500 px-3 py-1 text-xs font-medium text-amber-950 transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "rolling" ? "Updating…" : status === "done" ? "Reloading…" : "Update now"}
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          disabled={status !== "idle"}
          className="rounded-md px-2 py-1 text-xs text-amber-100/70 hover:bg-amber-500/10 hover:text-amber-50 disabled:cursor-not-allowed"
          aria-label="Dismiss update banner"
        >
          Later
        </button>
      </div>
    </div>
  );
}
