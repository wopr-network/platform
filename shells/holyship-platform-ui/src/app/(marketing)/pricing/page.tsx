"use client";

import Link from "next/link";
import { FadeIn } from "@/components/landing";

export default function PricingPage() {
  return (
    <>
      <section className="pt-16 md:pt-24 pb-12 flex flex-col justify-center items-center text-center px-6 md:px-16 lg:px-24">
        <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold leading-tight text-signal-orange">Free.</h1>
        <p className="text-2xl md:text-3xl text-off-white/70 mt-6">Yeah. You heard that right.</p>
      </section>

      <FadeIn>
        <section className="px-6 md:px-16 lg:px-24 py-16 md:py-20 mx-auto text-center max-w-3xl">
          <div className="space-y-8 text-xl md:text-2xl leading-relaxed text-off-white/90">
            <p>
              No tiers. No "starter plan." No "contact sales for enterprise pricing." No per-seat licensing. No annual
              commitment. No credit card required. No gotcha on page two of the terms.
            </p>

            <p className="text-signal-orange font-semibold text-2xl md:text-3xl">
              Free. As in beer. As in speech. As in lunch.
            </p>

            <p>Connect your repos. Point it at your backlog. Go home. Wake up to merged PRs. Don't pay us anything.</p>
          </div>
        </section>
      </FadeIn>

      <FadeIn>
        <section className="px-6 md:px-16 lg:px-24 py-16 md:py-20 mx-auto text-center max-w-3xl">
          <h2 className="text-3xl md:text-4xl font-bold text-signal-orange mb-12">The catch.</h2>

          <div className="space-y-8 text-xl md:text-2xl leading-relaxed text-off-white/90">
            <p>
              There isn't one. We're building in public. We eat our own dogfood — Holy Ship ships Holy Ship. We want you
              using it, breaking it, telling us what's wrong. That's worth more than your credit card number.
            </p>

            <p>
              Will it be free forever? Probably not. We'll figure out pricing when we've earned the right to charge for
              it. Right now we're earning your trust. That comes first. Always.
            </p>

            <p className="text-off-white/50 text-lg">
              Subject to change without notice. But we'll give you notice anyway, because we're not monsters.
            </p>
          </div>
        </section>
      </FadeIn>

      <FadeIn>
        <section className="px-6 md:px-16 lg:px-24 py-16 md:py-20 mx-auto text-center max-w-3xl">
          <h2 className="text-3xl md:text-4xl font-bold text-signal-orange mb-12">What you get.</h2>

          <div className="space-y-6 text-xl md:text-2xl leading-relaxed text-off-white/90">
            <p>Everything. The whole thing. No feature gates.</p>

            <ul className="space-y-4 text-left max-w-xl mx-auto">
              <li className="flex gap-3">
                <span className="text-signal-orange shrink-0">&#10003;</span>
                <span>Unlimited repos</span>
              </li>
              <li className="flex gap-3">
                <span className="text-signal-orange shrink-0">&#10003;</span>
                <span>Unlimited issues</span>
              </li>
              <li className="flex gap-3">
                <span className="text-signal-orange shrink-0">&#10003;</span>
                <span>Unlimited agents</span>
              </li>
              <li className="flex gap-3">
                <span className="text-signal-orange shrink-0">&#10003;</span>
                <span>Full pipeline — spec, code, test, review, merge</span>
              </li>
              <li className="flex gap-3">
                <span className="text-signal-orange shrink-0">&#10003;</span>
                <span>Learning loop — gets smarter with every issue</span>
              </li>
              <li className="flex gap-3">
                <span className="text-signal-orange shrink-0">&#10003;</span>
                <span>Your evenings back</span>
              </li>
            </ul>
          </div>
        </section>
      </FadeIn>

      <FadeIn>
        <section className="px-6 md:px-16 lg:px-24 py-16 md:py-24 mx-auto text-center">
          <p className="text-2xl md:text-3xl font-bold text-off-white max-w-3xl mx-auto leading-relaxed">
            Stop comparing pricing pages. Start shipping.&nbsp;
            <span className="text-signal-orange">Holy&nbsp;Ship.</span>
          </p>

          <Link
            href="/login"
            className="mt-12 inline-block px-8 py-4 bg-signal-orange text-near-black font-semibold text-lg rounded hover:opacity-90 transition-opacity"
          >
            Get Started — it's free
          </Link>
        </section>
      </FadeIn>
    </>
  );
}
