import { useCallback, useRef, useState } from "react";

/**
 * Serializes concurrent saves with coalescing.
 *
 * If a save is in-flight and more arrive, only the latest payload is kept
 * (intermediate ones are discarded). When the in-flight save finishes, the
 * pending payload is dispatched immediately.
 */
export function useSaveQueue<T>(saveFn: (payload: T) => Promise<void>) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inFlightRef = useRef(false);
  const pendingRef = useRef<T | null>(null);

  const flush = useCallback(
    async (payload: T) => {
      inFlightRef.current = true;
      setSaving(true);
      setError(null);
      try {
        await saveFn(payload);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        const next = pendingRef.current;
        pendingRef.current = null;
        if (next !== null) {
          // Tail-call: run the next pending payload
          void flush(next);
        } else {
          inFlightRef.current = false;
          setSaving(false);
        }
      }
    },
    [saveFn],
  );

  const enqueue = useCallback(
    (payload: T) => {
      if (inFlightRef.current) {
        // Coalesce: overwrite any previously queued payload
        pendingRef.current = payload;
      } else {
        void flush(payload);
      }
    },
    [flush],
  );

  return { enqueue, saving, error };
}
