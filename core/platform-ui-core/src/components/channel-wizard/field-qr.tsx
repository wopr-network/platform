"use client";

import { AlertTriangle, Check, RefreshCw, WifiOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { pollChannelQr } from "@/lib/api";
import type { ConfigField } from "@/lib/channel-manifests";

interface FieldQRProps {
  field: ConfigField;
  value: string;
  onChange: (key: string, value: string) => void;
  error?: string;
  botId?: string;
}

type QrState = "loading" | "qr" | "expired" | "connected" | "error" | "offline";

const POLL_INTERVAL = 2000;
const QR_TTL_SECONDS = 90;

export function FieldQR({ field, value: _value, onChange, error, botId }: FieldQRProps) {
  const [state, setState] = useState<QrState>("loading");
  const [qrPng, setQrPng] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(QR_TTL_SECONDS);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const expiresAtRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stateRef = useRef<QrState>("loading");

  // Keep stateRef in sync so poll callback can read current state
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  const startCountdown = useCallback(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      if (expiresAtRef.current === null) return;
      const remaining = Math.max(0, Math.ceil((expiresAtRef.current - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        setState("expired");
        if (countdownRef.current) clearInterval(countdownRef.current);
      }
    }, 1000);
  }, []);

  const poll = useCallback(async () => {
    if (!botId) {
      setState("offline");
      return;
    }
    try {
      const res = await pollChannelQr(botId);
      const currentState = stateRef.current;

      switch (res.status) {
        case "pending":
          if (res.qrPng) {
            setQrPng(res.qrPng);
            if (currentState === "loading" || currentState === "expired") {
              expiresAtRef.current = Date.now() + QR_TTL_SECONDS * 1000;
              setSecondsLeft(QR_TTL_SECONDS);
              startCountdown();
            }
            setState("qr");
          } else {
            setState("loading");
          }
          break;
        case "connected":
          setState("connected");
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          if (countdownRef.current) {
            clearInterval(countdownRef.current);
            countdownRef.current = null;
          }
          onChange(field.key, "connected");
          break;
        case "expired":
          setState("expired");
          if (countdownRef.current) clearInterval(countdownRef.current);
          break;
        case "no-session":
          setState("offline");
          break;
      }
    } catch {
      cleanup();
      setState("error");
      setErrorMsg("Could not reach the server. Check that your bot is running and try again.");
    }
  }, [botId, field.key, onChange, startCountdown, cleanup]);

  const startPolling = useCallback(() => {
    cleanup();
    setState("loading");
    setErrorMsg(null);
    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL);
  }, [cleanup, poll]);

  useEffect(() => {
    startPolling();
    return cleanup;
  }, [startPolling, cleanup]);

  function handleRefresh() {
    expiresAtRef.current = null;
    startPolling();
  }

  function countdownColor(): string {
    if (secondsLeft <= 5) return "text-destructive motion-safe:animate-pulse";
    if (secondsLeft <= 15) return "text-amber-500";
    return "text-terminal-dim";
  }

  return (
    <div className="space-y-2">
      <Label>{field.label}</Label>
      {field.description && <p className="text-sm text-muted-foreground">{field.description}</p>}

      <div className="flex flex-col items-center gap-5 rounded-sm border border-dashed p-8 animate-in fade-in duration-300">
        {/* --- Loading State --- */}
        {state === "loading" && (
          <div className="flex flex-col items-center gap-4">
            <Skeleton className="h-40 w-40 rounded-sm min-[375px]:h-48 min-[375px]:w-48" />
            <p className="text-sm text-muted-foreground">
              Generating secure QR code
              <span className="animate-ellipsis" />
            </p>
          </div>
        )}

        {/* --- QR Displayed State --- */}
        {state === "qr" && qrPng && (
          <div className="flex flex-col items-center gap-4">
            <div className="relative rounded-sm transition-shadow duration-1000 shadow-[0_0_24px_rgba(0,255,65,0.15)]">
              {/* Corner accents */}
              <div className="absolute top-0 left-0 h-3 w-3 border-t-2 border-l-2 border-terminal" />
              <div className="absolute top-0 right-0 h-3 w-3 border-t-2 border-r-2 border-terminal" />
              <div className="absolute bottom-0 left-0 h-3 w-3 border-b-2 border-l-2 border-terminal" />
              <div className="absolute bottom-0 right-0 h-3 w-3 border-b-2 border-r-2 border-terminal" />

              {/* bg-white is intentional -- QR codes require white background for scanability */}
              <div className="h-40 w-40 rounded-sm bg-white p-3 min-[375px]:h-48 min-[375px]:w-48">
                {/* biome-ignore lint/performance/noImgElement: QR PNG is a base64 data URI from the API — next/image does not support data: URIs (cannot optimize, resize, or lazy-load inline blobs). Raw <img> is the only option here. */}
                <img
                  src={qrPng}
                  alt="Scan this QR code with your phone"
                  className="h-full w-full"
                />
              </div>
            </div>

            {/* Scanning indicator */}
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-terminal motion-safe:animate-[pulse-dot_2s_ease-in-out_infinite]" />
              <span className="text-xs font-medium uppercase tracking-wider text-terminal">
                WAITING FOR SCAN
              </span>
            </div>

            {/* Instructions */}
            <p className="max-w-[280px] text-center text-sm text-muted-foreground">
              {field.description ?? "Scan this QR code with your mobile app to link your account"}
            </p>

            {/* Countdown */}
            <span className={`text-xs tabular-nums ${countdownColor()}`}>
              Expires in {secondsLeft}s
            </span>
          </div>
        )}

        {/* --- Expired State --- */}
        {state === "expired" && (
          <div className="flex flex-col items-center gap-4">
            <div className="relative rounded-sm">
              {/* Corner accents (dimmed) */}
              <div className="absolute top-0 left-0 h-3 w-3 border-t-2 border-l-2 border-terminal/30" />
              <div className="absolute top-0 right-0 h-3 w-3 border-t-2 border-r-2 border-terminal/30" />
              <div className="absolute bottom-0 left-0 h-3 w-3 border-b-2 border-l-2 border-terminal/30" />
              <div className="absolute bottom-0 right-0 h-3 w-3 border-b-2 border-r-2 border-terminal/30" />

              {/* bg-white is intentional -- QR codes require white background for scanability */}
              <div className="relative h-40 w-40 rounded-sm bg-white p-3 min-[375px]:h-48 min-[375px]:w-48">
                {qrPng && (
                  // biome-ignore lint/performance/noImgElement: base64 data URI — see comment above for rationale
                  <img src={qrPng} alt="Expired QR code" className="h-full w-full opacity-40" />
                )}
                {/* Dark overlay */}
                <div className="absolute inset-0 flex items-center justify-center rounded-sm bg-black/60 animate-in fade-in duration-300">
                  <RefreshCw className="size-8 text-white" />
                </div>
              </div>
            </div>

            <span className="text-xs font-medium uppercase tracking-wider text-amber-500">
              QR CODE EXPIRED
            </span>

            <p className="text-center text-sm text-muted-foreground">
              The code expired. Tap below to generate a fresh one.
            </p>

            <Button
              type="button"
              variant="terminal"
              size="sm"
              className="h-10 px-4"
              onClick={handleRefresh}
            >
              <RefreshCw className="size-3.5" />
              Generate New Code
            </Button>
          </div>
        )}

        {/* --- Connected / Success State --- */}
        {state === "connected" && (
          <div className="flex flex-col items-center gap-4 animate-in fade-in duration-300">
            <div className="flex h-40 w-40 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 min-[375px]:h-48 min-[375px]:w-48 animate-in zoom-in-90 duration-300">
              <Check className="size-16 text-emerald-500" />
            </div>

            <span className="text-xs font-medium uppercase tracking-wider text-emerald-500">
              LINKED SUCCESSFULLY
            </span>

            <p className="text-center text-sm text-muted-foreground">
              {field.label ? `${field.label} connected` : "Connected"}. You can continue setup.
            </p>
          </div>
        )}

        {/* --- Error State --- */}
        {state === "error" && (
          <div className="flex flex-col items-center gap-4">
            <AlertTriangle className="size-10 text-destructive" />

            <span className="text-xs font-medium uppercase tracking-wider text-destructive">
              CONNECTION ERROR
            </span>

            <p className="max-w-[280px] text-center text-sm text-muted-foreground">
              {errorMsg ||
                "Could not reach the server. Check that your bot is running and try again."}
            </p>

            <Button
              type="button"
              variant="terminal"
              size="sm"
              className="h-10 px-4"
              onClick={handleRefresh}
            >
              <RefreshCw className="size-3.5" />
              Try Again
            </Button>
          </div>
        )}

        {/* --- Bot Offline State --- */}
        {state === "offline" && (
          <div className="flex flex-col items-center gap-4">
            <WifiOff className="size-10 text-muted-foreground" />

            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              BOT OFFLINE
            </span>

            <p className="max-w-[280px] text-center text-sm text-muted-foreground">
              Your bot is currently offline. Start it from the fleet dashboard to link your account.
            </p>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
