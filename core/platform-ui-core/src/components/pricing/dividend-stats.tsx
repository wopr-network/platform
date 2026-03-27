"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { fetchDividendStats } from "@/lib/api";
import { toUserMessage } from "@/lib/errors";
import { formatCreditStandard } from "@/lib/format-credit";

function useCountUp(target: number, duration = 1200) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target === 0) {
      setValue(0);
      return;
    }
    // Respect prefers-reduced-motion: skip animation, set immediately
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setValue(target);
      return;
    }
    const start = performance.now();
    let raf: number;
    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - (1 - progress) ** 3;
      setValue(eased * target);
      if (progress < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

function formatDollars(n: number): string {
  return formatCreditStandard(n);
}

export function DividendStats() {
  const [pool, setPool] = useState(0);
  const [users, setUsers] = useState(0);
  const [dividend, setDividend] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchDividendStats()
      .then((data) => {
        if (cancelled) return;
        if (data) {
          setPool(data.poolAmountDollars);
          setUsers(data.activeUsers);
          setDividend(data.projectedDailyDividend);
        }
        setLoaded(true);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(toUserMessage(err, "Failed to load dividend stats"));
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const animatedPool = useCountUp(pool);
  const animatedUsers = useCountUp(users);
  const animatedDividend = useCountUp(dividend);

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {error && <p className="col-span-full text-center text-sm text-red-500">{error}</p>}
      <Card className="border-terminal/30">
        <CardContent className="flex flex-col items-center gap-1 py-6 text-center">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Today&apos;s community pool
          </p>
          <p className="text-3xl font-bold text-terminal sm:text-4xl" data-testid="pool-amount">
            {loaded && pool > 0 ? formatDollars(animatedPool) : "--"}
          </p>
        </CardContent>
      </Card>

      <Card className="border-terminal/30">
        <CardContent className="flex flex-col items-center gap-1 py-6 text-center">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Active users in pool
          </p>
          <p className="text-3xl font-bold text-terminal sm:text-4xl" data-testid="active-users">
            {loaded && users > 0 ? Math.round(animatedUsers).toLocaleString() : "--"}
          </p>
        </CardContent>
      </Card>

      <Card className="border-terminal/30">
        <CardContent className="flex flex-col items-center gap-1 py-6 text-center">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Your projected daily dividend
          </p>
          <p
            className="text-3xl font-bold text-terminal sm:text-4xl"
            data-testid="projected-dividend"
          >
            {loaded && dividend > 0 ? `~${formatCreditStandard(animatedDividend)}` : "--"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
