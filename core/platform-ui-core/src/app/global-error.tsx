"use client";

import { AlertTriangleIcon, HomeIcon, RefreshCwIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { brandName } from "@/lib/brand-config";
import { logger } from "@/lib/logger";

const log = logger("global-error");

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const isDev = process.env.NODE_ENV === "development";

  useEffect(() => {
    log.error("Root layout error", error);
  }, [error]);

  return (
    <html lang="en" className="dark">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`Error — ${brandName()}`}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
        className="bg-neutral-950 text-neutral-100 antialiased"
      >
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="w-full max-w-lg rounded-xl border border-neutral-800 bg-neutral-900 shadow-2xl">
            <div className="border-b border-neutral-800 px-6 pt-6 pb-4">
              <div className="flex items-center gap-3">
                <AlertTriangleIcon className="size-6 text-red-500" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
                    {brandName()}
                  </p>
                  <h1 className="text-xl font-semibold text-neutral-100">Something went wrong</h1>
                </div>
              </div>
            </div>
            <div className="space-y-4 px-6 py-4">
              <p className="text-sm text-neutral-400">
                An unexpected error occurred. You can try again or return to the dashboard.
              </p>
              {isDev && (
                <button
                  type="button"
                  onClick={() => setShowDetails((v) => !v)}
                  className="text-sm text-neutral-500 underline hover:text-neutral-300"
                >
                  {showDetails ? "Hide" : "Show"} error details
                </button>
              )}
              {isDev && showDetails && (
                <pre className="max-h-48 overflow-auto rounded-md border border-neutral-700 bg-neutral-800 p-3 text-xs text-neutral-300">
                  {error.message}
                  {error.stack && `\n\n${error.stack}`}
                  {error.digest && `\n\nDigest: ${error.digest}`}
                </pre>
              )}
            </div>
            <div className="flex gap-3 border-t border-neutral-800 px-6 py-4">
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-2 rounded-md bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-200"
              >
                <RefreshCwIcon className="size-4" />
                Try Again
              </button>
              <a
                href="/"
                className="inline-flex items-center gap-2 rounded-md border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-800"
              >
                <HomeIcon className="size-4" />
                Dashboard
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
