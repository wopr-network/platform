"use client";

import { AlertTriangleIcon, HomeIcon, RefreshCwIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { logger } from "@/lib/logger";

const log = logger("error-boundary:channels");

export default function ChannelsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const isDev = process.env.NODE_ENV === "development";

  useEffect(() => {
    log.error("Channels error", error);
  }, [error]);

  return (
    <div className="flex h-full items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="flex items-center gap-3">
            <AlertTriangleIcon className="size-6 text-destructive" />
            <CardTitle className="text-xl">Channels Error</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            Something went wrong loading channels. This may be a temporary issue.
          </p>
          {isDev && (
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={() => setShowDetails((v) => !v)}
              className="h-auto p-0 text-muted-foreground"
            >
              {showDetails ? "Hide" : "Show"} error details
            </Button>
          )}
          {isDev && showDetails && (
            <pre className="max-h-48 overflow-auto rounded-md border bg-muted p-3 text-xs">
              {error.message}
              {error.stack && `\n\n${error.stack}`}
              {error.digest && `\n\nDigest: ${error.digest}`}
            </pre>
          )}
        </CardContent>
        <CardFooter className="gap-3">
          <Button onClick={reset}>
            <RefreshCwIcon />
            Try Again
          </Button>
          <Button variant="outline" asChild>
            <a href="/dashboard">
              <HomeIcon />
              Dashboard
            </a>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
