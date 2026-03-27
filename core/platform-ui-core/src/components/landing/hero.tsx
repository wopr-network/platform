"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { TypingEffect } from "./typing-effect";

export function Hero() {
  return (
    <section className="crt-scanlines relative min-h-[100dvh] flex flex-col items-center justify-center bg-background px-6 text-center overflow-hidden">
      {/* Grid dot background */}
      <div
        className="animate-grid-drift pointer-events-none absolute inset-0 bg-grid-dots"
        style={{
          maskImage: "radial-gradient(ellipse at center, black 40%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, black 40%, transparent 80%)",
        }}
        aria-hidden="true"
      />

      {/* Radial glow pulse */}
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
        aria-hidden="true"
      >
        <div className="animate-gentle-pulse h-[600px] w-[600px] rounded-full bg-terminal/5 blur-[120px]" />
      </div>

      <div className="relative z-10 flex flex-col items-center">
        <h1 className="max-w-4xl text-3xl font-bold leading-[1.1] tracking-tight text-foreground sm:text-5xl md:text-6xl lg:text-7xl">
          <span className="sr-only">Shall we play a game?</span>
          <span aria-hidden="true">
            <TypingEffect text="Shall we play a game?" speed={40} />
          </span>
        </h1>

        <p className="mt-8 max-w-2xl text-lg text-muted-foreground md:text-xl">
          A $5/month supercomputer that runs your business. No really. We know because we run ours
          on one.
        </p>

        <div className="mt-12 flex flex-col items-center gap-4 sm:flex-row">
          <Button variant="terminal" size="lg" asChild>
            <Link href="/signup">Get yours</Link>
          </Button>
        </div>

        <span className="mt-4 text-sm text-muted-foreground">
          Starting at $5/month. Less than Netflix.
        </span>
      </div>
    </section>
  );
}
