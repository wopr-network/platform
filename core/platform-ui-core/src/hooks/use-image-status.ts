import { useCallback, useEffect, useState } from "react";
import type { ImageStatusResponse } from "@/lib/api";
import { getImageStatus } from "@/lib/api";

export function useImageStatus(id: string | null) {
  const [data, setData] = useState<ImageStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    const result = await getImageStatus(id);
    if (result === null) {
      setError("Failed to fetch image status");
      setData(null);
    } else {
      setData(result);
      setError(null);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    if (id) refresh();
  }, [id, refresh]);

  return {
    updateAvailable: data?.updateAvailable ?? false,
    loading,
    error,
    refresh,
  };
}
