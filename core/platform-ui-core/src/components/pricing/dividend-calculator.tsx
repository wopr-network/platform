"use client";

import { Card, CardContent } from "@/components/ui/card";

export function DividendCalculator() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <Card className="border-terminal/20 bg-terminal/5">
        <CardContent className="space-y-4 py-6">
          <p className="text-center text-sm uppercase tracking-widest text-muted-foreground">
            The math. Open and honest.
          </p>
          <div className="space-y-2 text-center">
            <p className="text-lg text-foreground">
              <span className="font-semibold text-terminal">100K active users</span> &middot;{" "}
              <span className="font-semibold text-terminal">$20/month average spend</span> &middot;
              equal daily share
            </p>
            <p className="text-muted-foreground">
              Projected dividend: <span className="font-semibold text-terminal">~$0.67/day</span>.
              Average daily spend: <span className="font-semibold text-terminal">~$0.67</span>.
            </p>
            <p className="text-xl font-bold text-terminal" data-testid="net-cost">
              Net cost of credits at scale: $0.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-amber-500/20 bg-amber-500/5">
        <CardContent className="space-y-2 py-6 text-center">
          <p className="text-sm uppercase tracking-widest text-amber-500">
            Early adopter advantage
          </p>
          <p className="text-foreground">
            The earlier you join, the more you accumulate. Day 1 users in a 100K community collect{" "}
            <span className="font-semibold text-terminal">~$132</span> in their first 60 days on a
            $5 minimum spend.
          </p>
          <p className="text-sm text-muted-foreground">
            The math doesn&apos;t lie — being early pays.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
