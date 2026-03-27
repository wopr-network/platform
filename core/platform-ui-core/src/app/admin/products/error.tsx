"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ProductsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Admin products page error:", error);
  }, [error]);

  return (
    <div className="flex h-64 flex-col items-center justify-center gap-4 p-6">
      <p className="text-sm text-destructive">Failed to load product configuration.</p>
      <p className="text-xs text-muted-foreground">{error.message}</p>
      <Button variant="outline" size="sm" onClick={reset}>
        Try Again
      </Button>
    </div>
  );
}
