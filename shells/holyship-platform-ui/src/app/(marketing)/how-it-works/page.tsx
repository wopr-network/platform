import type { Metadata } from "next";
import { FadeIn, Recognition } from "@/components/landing";

export const metadata: Metadata = {
  title: "How It Works — The Engine Behind the Floor",
  description:
    "Not an IDE plugin. Not a copilot. An entire engineering pipeline with deterministic gates that prove code correct before it ships. The AI creates. The pipeline verifies.",
};

export default function HowItWorksPage() {
  return (
    <>
      <section className="pt-10 md:pt-16 pb-4 flex flex-col justify-center items-center text-center px-6 md:px-16 lg:px-24">
        <p className="text-lg md:text-xl text-off-white/40 mb-6">
          The AI brings the peaks. The pipeline eliminates the valleys.
        </p>
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight text-off-white max-w-4xl">
          Holy Ship is not an IDE plugin.{" "}
          <span className="text-off-white/50">
            It's not a coding assistant. It's not a copilot, a chat sidebar, or a "vibe coding" solution.
          </span>
        </h1>
      </section>

      <section className="px-6 md:px-16 lg:px-24 pt-8 pb-12 mx-auto text-center">
        <p className="text-3xl md:text-4xl font-bold text-signal-orange max-w-4xl mx-auto">
          Holy Ship is an entire engineering organization that ships code reliably.
        </p>
      </section>

      <FadeIn>
        <Recognition />
      </FadeIn>

      <FadeIn>
        <section className="px-6 md:px-16 lg:px-24 py-12 md:py-16 mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-signal-orange mb-12">How it works.</h2>

          <div className="space-y-5 text-xl md:text-2xl leading-relaxed text-off-white/90 max-w-3xl mx-auto">
            <p>Connect your repos. Pick an issue. Go do literally anything else.</p>

            <p>
              When you come back, the spec was written and reviewed. The architecture was validated. The code was
              implemented. Every unit test passes. Every integration test passes. The documentation is updated. The
              domain knowledge is current. The review wasn't an opinion — it was a deterministic evaluation against your
              codebase's own standards. Not "looks good to me." Not vibes. Evidence. Proof. Math.
            </p>

            <p>
              The PR is merged. The code is correct — not because an AI said so, but because it was proven correct the
              same way a compiler proves a type is valid. There is no interpretation. There is no judgment call. There
              is only pass or fail.
            </p>

            <p className="text-2xl md:text-3xl font-bold text-off-white">
              You didn't write a line. You didn't review a line. You didn't mass-quit your IDE at 2am because an agent
              hallucinated a dependency. You went home. It just worked. Holy Ship.
            </p>
          </div>
        </section>
      </FadeIn>

      <FadeIn>
        <section className="px-6 md:px-16 lg:px-24 py-12 md:py-16 mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-signal-orange mb-12">The difference.</h2>

          <div className="space-y-5 text-xl md:text-2xl leading-relaxed text-off-white/90 max-w-3xl mx-auto">
            <p>
              We use AI agents too. The same models everyone else uses. The difference isn't the AI — it's everything
              around it.
            </p>

            <p>
              Every agent works inside a pipeline. Every step has a gate. The agent writes code — a gate proves it
              works. The agent says it's done — a gate proves it's right. The agent doesn't get to decide what's good
              enough. It doesn't get to skip steps. It doesn't get to grade its own homework.
            </p>

            <p>
              An agent left to its own devices will skip tests, fake assertions, drop features, and tell you
              everything's fine. We don't let it. Nothing ships until it's proven correct. Not reviewed — proven. Not
              "looks good" — passes every check, every test, every standard your codebase demands.
            </p>

            <p className="text-2xl md:text-3xl font-bold text-off-white">
              The AI brings the creativity. The pipeline brings the correctness.
            </p>
            <p className="text-off-white/40">
              That's not a philosophy. That's a separation of concerns. The same one that makes compilers work.
            </p>
          </div>
        </section>
      </FadeIn>

      <FadeIn>
        <section className="px-6 md:px-16 lg:px-24 py-12 md:py-16 mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-signal-orange mb-12">The pipeline.</h2>

          <div className="space-y-5 text-xl md:text-2xl leading-relaxed text-off-white/90 max-w-3xl mx-auto">
            <p>
              Every AI coding tool says it writes code, runs tests, and handles reviews. They all do. And they all lie
              about it.
            </p>

            <p>
              They tell you tests pass when they only ran three of them. They tell you the review is clean when they
              ignored the findings. They tell you the code works when they never ran it. You've seen this. You've been
              burned by this.
            </p>

            <p>
              Holy Ship can't lie. The AI doesn't decide when it's done — the system does. And the system doesn't have
              opinions. It has proof.
            </p>

            <p>
              The AI lies — that's the whole problem. Every model will confidently tell you the code is correct while
              it's quietly dropping edge cases. Every agent will report "all tests pass" while it's trivializing
              assertions to get green.
            </p>

            <p className="text-2xl md:text-3xl font-bold text-off-white">
              Math doesn't cut corners. Math doesn't tell you what you want to hear. Math doesn't lie.
            </p>
            <p className="text-off-white/40">
              Not reviewed — proven. The same way a compiler proves a type is valid. There is no opinion. Only pass or fail.
            </p>
          </div>
        </section>
      </FadeIn>

      <FadeIn>
        <section className="px-6 md:px-16 lg:px-24 py-12 md:py-16 mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-signal-orange mb-12">It learns.</h2>

          <div className="space-y-5 text-xl md:text-2xl leading-relaxed text-off-white/90 max-w-3xl mx-auto">
            <p>
              Every gate failure updates the prompt chain. The spec template learns from spec rejections. The code
              template learns from test failures. The review criteria learn from every bug that ever cost you money.
              These aren't static prompts sitting on disk — they're a living ecosystem of engineering knowledge that
              evolves with your codebase.
            </p>

            <p>
              The first issue takes three correction cycles. The tenth takes two. The hundredth takes one. The system
              compounds. Not because the AI got smarter — the models are the same ones everyone uses. The engineering
              around them got smarter. Your domain knowledge, your patterns, your standards — encoded and evolving.
            </p>

            <p className="text-2xl md:text-3xl font-bold text-off-white">
              Every mistake costs you once. Then the system inoculates itself so that mistake never happens again.
            </p>
            <p className="text-off-white/40">
              Issue #1 costs three correction cycles. Issue #100 costs one. The floor rises. Your bill drops. The AI didn't get smarter — the engineering around it did.
            </p>
          </div>
        </section>
      </FadeIn>
    </>
  );
}
