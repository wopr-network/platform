import type { Metadata } from "next";
import { FadeIn } from "@/components/landing";

export const metadata: Metadata = {
  title: "Vibe Coding vs. Engineering — Hope vs. Proof",
  description:
    "Every step of the AI coding workflow, side by side. One side hopes the peaks hold. The other guarantees the valleys can't kill you. 13 steps compared.",
};

const steps = [
  {
    title: "The spec.",
    vibe: "Skip it. Just start coding. The AI will figure out what you meant.",
    engineered:
      "Spec written and reviewed before a line of code exists. The agent knows what to build because we told it. Not because it guessed.",
  },
  {
    title: "The architecture.",
    vibe: "The AI knows best. Let it make decisions about your codebase it's never seen before.",
    engineered:
      "Validated against your repo's actual patterns. Not the model's training data. Your conventions. Your opinions. Your code.",
  },
  {
    title: "The prompts.",
    vibe: "Static files on disk. Written once by an engineer who left. Rotting silently. Working fine on the demo. Falling apart on your code.",
    engineered:
      "Alive. Every spec rejection sharpens the spec template. Every test failure sharpens the code template. Every bug sharpens the review. They never stop evolving.",
  },
  {
    title: "The context.",
    vibe: "Entire tool call output dumped into the context window you're paying for. Thousands of tokens of noise. Expensive. Slow. The model drowns in irrelevant information.",
    engineered:
      "Sandboxed and indexed for free. Only what matters reaches the window you pay for. Cheaper tokens. Faster responses. No drowning.",
  },
  {
    title: "The prompt engineering.",
    vibe: "One-size-fits-all system prompt. Same instructions whether you're building a REST API or a billing pipeline. Hope the model figures out the difference.",
    engineered:
      "Dynamic. Per-task. Shaped by your codebase's history, your domain, your patterns. Every prompt is built for the work being done right now.",
  },
  {
    title: "The implementation.",
    vibe: "Generate and pray. Cross your fingers. Read every line yourself because you don't trust it. You're the QA department now.",
    engineered:
      "Gates at every step. Code doesn't proceed until it passes. Not because someone reviewed it — because it was proven correct.",
  },
  {
    title: "The testing.",
    vibe: "AI says tests pass. It ran three of them. The assertions assert nothing. It wrote tests that test the mock, not the code. Green means nothing.",
    engineered:
      "Every test runs. Assertions verified. Coverage measured. The agent doesn't choose which tests matter. The gate doesn't open until they all pass.",
  },
  {
    title: "The review.",
    vibe: "LGTM. Looks good to me. Ship it. Nobody actually read the diff. The AI reviewed its own code and found it excellent.",
    engineered:
      "Not an opinion — a measurement. Lint, types, patterns, security. The reviewer doesn't have feelings. It has criteria.",
  },
  {
    title: "The human.",
    vibe: "Babysitting the AI. Watching it code. Correcting it. Reviewing everything. You're a manager who does all the work. Congratulations on your new junior developer that never learns.",
    engineered:
      "You approve the spec. You approve the architecture. Then you go home. The pipeline handles everything between approval and merged PR.",
  },
  {
    title: "The documentation.",
    vibe: "We'll do it later. We never do it later. The code is the documentation. The code is not the documentation.",
    engineered: "Ships with the code. The gate won't open until it does. Not optional. Not a follow-up ticket. Done.",
  },
  {
    title: "The domain knowledge.",
    vibe: "In someone's head. Hope they don't leave. Hope they remember. Hope the next developer asks the right questions. They won't.",
    engineered: "In the system. Encoded, versioned, evolving. People leave. The system stays. The knowledge compounds.",
  },
  {
    title: "The learning cycle.",
    vibe: "Doesn't exist. Every issue starts from zero. The AI makes the same mistakes on issue #100 that it made on issue #1. You correct it again. And again. And again.",
    engineered:
      "Every gate failure updates the prompt chain. Every mistake inoculates the system. Issue #100 costs a fraction of issue #1.",
  },
  {
    title: "The next issue.",
    vibe: "Start from scratch. Same static prompts. Same generic context. Same mistakes. Same corrections. Same babysitting. Groundhog Day with a terminal.",
    engineered:
      "Smarter prompts. Sharper context. Deeper knowledge. Cheaper tokens. Higher floor. The curve goes down.",
  },
];

export default function VibeCodingVsEngineeringPage() {
  return (
    <>
      <section className="pt-10 md:pt-16 pb-12 flex flex-col justify-center items-center text-center px-6 md:px-16 lg:px-24">
        <p className="text-lg md:text-xl text-off-white/40 mb-6">
          One side hopes the peaks hold. The other guarantees the valleys can't kill you.
        </p>
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight text-off-white max-w-4xl">
          Vibe coding vs. <span className="text-signal-orange">engineering.</span>
        </h1>
        <p className="text-xl md:text-2xl text-off-white/50 mt-6 max-w-2xl">
          Every step of the workflow. Side by side. What you're doing now vs. what shipping actually looks like.
        </p>
      </section>

      {steps.map((step, i) => (
        <FadeIn key={step.title}>
          <section className="px-6 md:px-16 lg:px-24 py-10 md:py-14 mx-auto max-w-5xl">
            <h2 className="text-2xl md:text-3xl font-bold text-signal-orange mb-8">
              {i + 1}. {step.title}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-lg border border-off-white/10 p-6 bg-off-white/[0.02]">
                <p className="text-xs font-bold uppercase tracking-widest text-off-white/30 mb-3">Vibe coding</p>
                <p className="text-lg leading-relaxed text-off-white/70">{step.vibe}</p>
              </div>

              <div className="rounded-lg border border-signal-orange/30 p-6 bg-signal-orange/[0.04]">
                <p className="text-xs font-bold uppercase tracking-widest text-signal-orange/60 mb-3">Holy Ship</p>
                <p className="text-lg leading-relaxed text-off-white/90">{step.engineered}</p>
              </div>
            </div>
          </section>
        </FadeIn>
      ))}

      <FadeIn>
        <section className="px-6 md:px-16 lg:px-24 py-16 md:py-20 mx-auto text-center">
          <p className="text-2xl md:text-3xl font-bold text-off-white max-w-3xl mx-auto leading-relaxed">
            One side is hope. The other is proof. One side starts over every time. The other compounds. You went home.
            It just shipped. <span className="text-signal-orange">Holy Ship.</span>
          </p>
        </section>
      </FadeIn>
    </>
  );
}
