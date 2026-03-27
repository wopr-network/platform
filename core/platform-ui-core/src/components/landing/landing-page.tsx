"use client";

import Link from "next/link";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { getBrandConfig, productName } from "@/lib/brand-config";
import { LandingNav } from "./landing-nav";
import { PortfolioChart } from "./portfolio-chart";
import { StorySections } from "./story-sections";
import { TerminalSequence } from "./terminal-sequence";

function CtaBlock({ className }: { className?: string }) {
  return (
    <div className={`flex flex-col items-center ${className ?? ""}`}>
      <Button variant="terminal" size="lg" asChild>
        <Link href="/signup">Start for free</Link>
      </Button>
      <span className="mt-4 font-mono text-xs text-terminal/40">
        Your {productName()} is waiting.
      </span>
    </div>
  );
}

export function LandingPage() {
  const milestoneRef = useRef<((label: string) => void) | null>(null);
  const fadeStartRef = useRef<(() => void) | null>(null);

  return (
    <div className="bg-black font-mono">
      <LandingNav />
      {/* Hero — Terminal Animation */}
      <div className="relative bg-black">
        <PortfolioChart onMilestoneRef={milestoneRef} onFadeStartRef={fadeStartRef} />
        <TerminalSequence
          onMilestone={(label) => milestoneRef.current?.(label)}
          onFadeStart={() => fadeStartRef.current?.()}
        />
        <div className="absolute bottom-12 left-1/2 z-30 -translate-x-1/2">
          <CtaBlock />
        </div>
      </div>

      {/* Story Sections */}
      <div className="bg-black">
        <StorySections />
      </div>

      {/* Bottom CTA — always visible (scrolled to) */}
      <div className="bg-black">
        <CtaBlock className="py-12" />
      </div>

      {/* Footer */}
      <footer className="border-t border-terminal/10 bg-black px-4 py-12">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-4">
          <span className="font-mono text-sm font-semibold text-terminal/60">{productName()}</span>
          <div className="flex gap-6 font-mono text-xs text-terminal/30">
            <Link href="/privacy" className="underline underline-offset-4 hover:text-terminal/60">
              Privacy
            </Link>
            <Link href="/terms" className="underline underline-offset-4 hover:text-terminal/60">
              Terms
            </Link>
          </div>
          <span className="font-mono text-xs text-terminal/20">{getBrandConfig().domain}</span>
        </div>
      </footer>
    </div>
  );
}
