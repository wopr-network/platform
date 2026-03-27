"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { initiateChannelOAuth, pollChannelOAuth } from "@/lib/api";
import { eventName } from "@/lib/brand-config";
import type { ConfigField } from "@/lib/channel-manifests";

interface FieldOAuthProps {
  field: ConfigField;
  value: string;
  onChange: (key: string, value: string) => void;
  error?: string;
}

type OAuthStatus = "idle" | "authorizing" | "exchanging" | "authorized" | "error";

export function FieldOAuth({ field, value, onChange, error }: FieldOAuthProps) {
  const [status, setStatus] = useState<OAuthStatus>(value ? "authorized" : "idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);
  const stateRef = useRef<string | null>(null);
  const statusRef = useRef<OAuthStatus>(value ? "authorized" : "idle");

  // Keep statusRef in sync so the popup close monitor can read current status
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const pollForToken = useCallback(
    async (state: string) => {
      const maxAttempts = 30; // 30 seconds at 1s interval
      for (let i = 0; i < maxAttempts; i++) {
        try {
          const data = await pollChannelOAuth(state);

          if (data.status === "completed" && data.token) {
            onChange(field.key, data.token);
            setStatus("authorized");
            setErrorMsg(null);
            return;
          }
          if (data.status === "expired") {
            setStatus("error");
            setErrorMsg("OAuth session expired. Please try again.");
            return;
          }
          // Still pending — wait and retry
          await new Promise((r) => setTimeout(r, 1000));
        } catch {
          setStatus("error");
          setErrorMsg("Network error while checking authorization status");
          return;
        }
      }
      setStatus("error");
      setErrorMsg("Authorization timed out. Please try again.");
    },
    [field.key, onChange],
  );

  // Listen for postMessage from the OAuth popup
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      // Validate origin
      if (event.origin !== window.location.origin) return;
      const data = event.data as Record<string, unknown>;
      if (!data || data.type !== eventName("oauth-callback")) return;

      if (data.status === "error") {
        setStatus("error");
        setErrorMsg((data.error as string) || "OAuth authorization failed");
        return;
      }

      if (data.status === "success" && data.state) {
        // Poll for the token
        setStatus("exchanging");
        pollForToken(data.state as string);
      }
    },
    [pollForToken],
  );

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  async function handleAuthorize() {
    setStatus("authorizing");
    setErrorMsg(null);

    const provider = field.oauthProvider;
    if (!provider) {
      setStatus("error");
      setErrorMsg("No OAuth provider configured for this field");
      return;
    }

    // Open a blank popup synchronously (before the async fetch) to avoid
    // popup blockers, which only allow window.open() in synchronous event handlers.
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    const popup = window.open(
      "about:blank",
      eventName("oauth-popup"),
      `width=${width},height=${height},left=${left},top=${top},popup=yes`,
    );

    if (!popup) {
      setStatus("error");
      setErrorMsg("Popup blocked. Please allow popups for this site and try again.");
      return;
    }

    popupRef.current = popup;

    try {
      const res = await initiateChannelOAuth(provider);

      if (!res.ok) {
        popup.close();
        const data = (await res.json()) as { error?: string };
        setStatus("error");
        setErrorMsg(data.error || "Failed to start OAuth flow");
        return;
      }

      const { authorizeUrl, state } = (await res.json()) as {
        authorizeUrl: string;
        state: string;
      };
      stateRef.current = state;

      // Navigate the already-open popup to the authorization URL
      popup.location.href = authorizeUrl;

      // Monitor popup close (user might close it manually)
      const interval = setInterval(() => {
        if (popup.closed) {
          clearInterval(interval);
          // If we haven't received a success/error message yet, return to idle
          if (statusRef.current === "authorizing") {
            setStatus("idle");
          }
        }
      }, 500);
    } catch {
      popup.close();
      setStatus("error");
      setErrorMsg("Network error. Please check your connection and try again.");
    }
  }

  return (
    <div className="space-y-2">
      <Label>{field.label}</Label>
      {field.description && <p className="text-sm text-muted-foreground">{field.description}</p>}
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant={status === "authorized" ? "secondary" : "default"}
          onClick={handleAuthorize}
          disabled={status === "authorizing" || status === "exchanging"}
        >
          {status === "idle" && "Authorize"}
          {status === "authorizing" && "Authorizing..."}
          {status === "exchanging" && "Completing..."}
          {status === "authorized" && "Re-authorize"}
          {status === "error" && "Retry"}
        </Button>
        {status === "authorized" && <span className="text-sm text-emerald-500">Connected</span>}
      </div>
      {(errorMsg || error) && <p className="text-sm text-destructive">{errorMsg || error}</p>}
    </div>
  );
}
