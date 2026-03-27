"use client";

import { XIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Banner } from "@/components/ui/banner";
import type { AccountStatusValue } from "@/lib/api";
import { getAccountStatus } from "@/lib/api";

function daysUntil(deadline: string): number {
  const ms = new Date(deadline).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

export function DegradedStateBanner() {
  const [status, setStatus] = useState<AccountStatusValue | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [graceDeadline, setGraceDeadline] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const load = useCallback(async () => {
    const data = await getAccountStatus();
    if (!data) return;
    setStatus(data.status);
    setReason(data.statusReason);
    setGraceDeadline(data.graceDeadline);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (dismissed || !status || status === "active") return null;

  if (status === "grace_period") {
    const days = graceDeadline ? daysUntil(graceDeadline) : null;
    return (
      <Banner variant="warning" role="alert">
        <span className="flex-1">
          ACTION REQUIRED —{" "}
          {days !== null
            ? `${days} day${days === 1 ? "" : "s"} to resolve`
            : "resolve soon to avoid suspension"}
          {reason ? ` (${reason})` : ""}
        </span>
        <Link href="/billing" className="font-semibold underline underline-offset-4">
          Update payment method
        </Link>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="ml-2 p-1 rounded hover:bg-white/10 min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="Dismiss"
        >
          <XIcon className="size-4" />
        </button>
      </Banner>
    );
  }

  if (status === "suspended") {
    return (
      <Banner variant="destructive" role="alert" className="animate-gentle-pulse">
        <span className="flex-1">
          ACCOUNT SUSPENDED — bots are offline
          {reason ? ` (${reason})` : ""}
        </span>
        <Link href="/billing" className="font-semibold underline underline-offset-4">
          Contact support
        </Link>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="ml-2 p-1 rounded hover:bg-white/10 min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="Dismiss"
        >
          <XIcon className="size-4" />
        </button>
      </Banner>
    );
  }

  if (status === "banned") {
    return (
      <Banner variant="destructive" role="alert">
        <span className="flex-1">
          ACCOUNT TERMINATED
          {reason ? ` — ${reason}` : ""}
        </span>
      </Banner>
    );
  }

  return null;
}
