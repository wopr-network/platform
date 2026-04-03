import type { Metadata } from "next";
import { FadeIn, Hero } from "@/components/landing";

export const metadata: Metadata = {
  title: "AI is Jagged. We Raise the Floor.",
  description:
    "AI is superhuman at some things and fails at simple ones. Holy Ship raises the floor with gates, proof, and a learning loop that compounds. Go home. It just works.",
};

export default function Home() {
  return (
    <>
      <Hero />

      {/* Jagged Intelligence */}
      <FadeIn>
        <section className="px-6 md:px-16 lg:px-24 py-20 md:py-28 mx-auto text-center max-w-3xl">
          <p className="text-3xl md:text-4xl font-bold text-off-white">
            The intelligence isn't low. It's{" "}
            <span className="text-signal-orange italic">jagged.</span>
          </p>

          <div className="mt-12 space-y-4 text-lg md:text-xl text-off-white/50">
            <p>
              Perfect billing system in ten minutes —{" "}
              <span className="text-off-white/25">then it imported a package that doesn't exist.</span>
            </p>
            <p>
              Refactored your entire API —{" "}
              <span className="text-off-white/25">silently deleted the error handling.</span>
            </p>
            <p>
              Beautiful test coverage —{" "}
              <span className="text-off-white/25">
                every assertion was <code className="text-xs font-mono">true === true</code>.
              </span>
            </p>
          </div>

          <p className="text-2xl md:text-3xl text-off-white/70 mt-12">
            Right now, <span className="text-off-white font-semibold">you're</span> the floor.
            <br />
            You can't go home because you can't trust it alone.
          </p>
        </section>
      </FadeIn>


      {/* The Flip */}
      <FadeIn>
        <section className="px-6 md:px-16 lg:px-24 py-16 md:py-24 mx-auto text-center max-w-3xl">
          <p className="text-3xl md:text-5xl font-bold text-signal-orange leading-tight">
            We raise the floor.
          </p>
          <p className="text-xl md:text-2xl text-off-white/50 mt-8">
            Not smarter AI. Same models everyone uses.
            <br />
            Gates that don't open until the code is proven correct.
            <br />
            Not reviewed. <span className="text-off-white font-semibold">Proven.</span>
          </p>
          <p className="text-2xl md:text-3xl text-off-white mt-12">
            You go home. It just works.{" "}
            <span className="text-signal-orange font-bold">Holy Ship.</span>
          </p>

          <a
            href="/login"
            className="mt-14 inline-block px-10 py-4 bg-signal-orange text-near-black font-semibold text-lg rounded hover:opacity-90 transition-opacity"
          >
            Get Started
          </a>
        </section>
      </FadeIn>

      {/* Not sold yet? Go deeper. */}
      <FadeIn>
        <section className="px-6 md:px-16 lg:px-24 py-20 md:py-28 mx-auto max-w-2xl">
          <p className="text-2xl md:text-3xl font-bold text-off-white text-center mb-16">
            Not convinced? Good. <span className="text-off-white/40">We wrote the proof.</span>
          </p>

          <div className="space-y-10">
            <a href="/how-it-works" className="group block">
              <p className="text-xl md:text-2xl font-bold text-signal-orange group-hover:opacity-80 transition-opacity">
                How it works &rarr;
              </p>
              <p className="text-base md:text-lg text-off-white/40 mt-1">
                The engine. The gates. Why the AI doesn't get to grade its own homework.
              </p>
            </a>

            <a href="/the-real-cost" className="group block">
              <p className="text-xl md:text-2xl font-bold text-signal-orange group-hover:opacity-80 transition-opacity">
                The real cost &rarr;
              </p>
              <p className="text-base md:text-lg text-off-white/40 mt-1">
                2.8 correction cycles per issue. The math on why humans as the floor bankrupts you.
              </p>
            </a>

            <a href="/the-learning-loop" className="group block">
              <p className="text-xl md:text-2xl font-bold text-signal-orange group-hover:opacity-80 transition-opacity">
                The learning loop &rarr;
              </p>
              <p className="text-base md:text-lg text-off-white/40 mt-1">
                Issue #1 takes three cycles. Issue #100 takes one. The floor rises.
              </p>
            </a>

            <a href="/vibe-coding-vs-engineering" className="group block">
              <p className="text-xl md:text-2xl font-bold text-signal-orange group-hover:opacity-80 transition-opacity">
                Vibe coding vs. engineering &rarr;
              </p>
              <p className="text-base md:text-lg text-off-white/40 mt-1">
                Every step. Side by side. Hope vs. proof.
              </p>
            </a>

            <a href="/why-not-prompts" className="group block">
              <p className="text-xl md:text-2xl font-bold text-signal-orange group-hover:opacity-80 transition-opacity">
                Why not prompts &rarr;
              </p>
              <p className="text-base md:text-lg text-off-white/40 mt-1">
                500,000 lines of leaked source code. Here's what we found inside.
              </p>
            </a>
          </div>
        </section>
      </FadeIn>

    </>
  );
}
