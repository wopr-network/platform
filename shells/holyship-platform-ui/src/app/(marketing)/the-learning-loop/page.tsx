"use client";

import { FadeIn } from "@/components/landing";

export default function TheLearningLoopPage() {
  return (
    <>
      <section className="pt-10 md:pt-16 pb-12 flex flex-col justify-center items-center text-center px-6 md:px-16 lg:px-24">
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight text-off-white max-w-4xl">
          The learning loop.
        </h1>
        <p className="text-xl md:text-2xl text-off-white/50 mt-6 max-w-2xl">
          Every other tool ships with static prompts that rot. Holy Ship ships with an engineering brain that evolves.
        </p>
      </section>

      <FadeIn>
        <section className="px-6 md:px-16 lg:px-24 py-12 md:py-16 mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-signal-orange mb-12">
            Prompts aren't code. They're knowledge.
          </h2>

          <div className="space-y-5 text-xl md:text-2xl leading-relaxed text-off-white/90 max-w-3xl mx-auto">
            <p>
              Most AI coding tools have a folder of prompts. System prompt. Code generation prompt. Review prompt.
              Written once by an engineer who left six months ago. They work fine on the demo. They fall apart on your
              codebase.
            </p>

            <p>
              Your codebase has opinions. Your team has conventions. Your domain has edge cases that no generic prompt
              will ever anticipate. The gap between "works on the demo" and "works on your code" is where every AI tool
              falls apart.
            </p>

            <p className="text-2xl md:text-3xl font-bold text-off-white">
              Holy Ship closes that gap. Not once — continuously.
            </p>
          </div>
        </section>
      </FadeIn>

      <FadeIn>
        <section className="px-6 md:px-16 lg:px-24 py-12 md:py-16 mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-signal-orange mb-12">What updates.</h2>

          <div className="space-y-5 text-xl md:text-2xl leading-relaxed text-off-white/90 max-w-3xl mx-auto">
            <p>
              When a spec gets rejected, the spec template learns what was missing. When a test fails, the code template
              learns what was assumed. When a review catches a pattern violation, the review criteria get sharper. When
              a production incident traces back to a missed edge case, that edge case gets encoded into the pipeline
              permanently.
            </p>

            <p>
              Every layer of the pipeline has its own prompt chain. Spec generation. Architecture validation.
              Implementation. Testing strategy. Review criteria. Documentation standards. Each one evolves independently
              based on what actually happened — not what someone guessed would happen.
            </p>

            <p>
              This isn't fine-tuning a model. The models are the same ones everyone uses. This is fine-tuning the
              engineering process around the model — the instructions, the context, the domain knowledge, the
              guardrails. The part that actually determines whether the output is correct.
            </p>
          </div>
        </section>
      </FadeIn>

      <FadeIn>
        <section className="px-6 md:px-16 lg:px-24 py-12 md:py-16 mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-signal-orange mb-12">Why it compounds.</h2>

          <div className="space-y-5 text-xl md:text-2xl leading-relaxed text-off-white/90 max-w-3xl mx-auto">
            <p>
              The first issue takes three correction cycles. The agent writes code, the gate rejects it, the agent
              corrects, the gate rejects again, the agent corrects, the gate passes. Three rounds. That's normal —
              that's the measured reality of AI against complex codebases.
            </p>

            <p>
              But the tenth issue only takes two cycles. The spec template already knows your API conventions. The code
              template already knows your error handling patterns. The review criteria already know your team's style.
            </p>

            <p>
              The hundredth issue takes one. The system has seen your codebase's patterns so many times that the first
              draft is almost right. The correction is minor. The gate passes fast.
            </p>

            <p className="text-2xl md:text-3xl font-bold text-off-white">
              The cost curve doesn't flatten. It trends down. Every issue you ship makes the next one cheaper, faster,
              and more correct.
            </p>
          </div>
        </section>
      </FadeIn>

      <FadeIn>
        <section className="px-6 md:px-16 lg:px-24 py-12 md:py-16 mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-signal-orange mb-12">Static prompts rot.</h2>

          <div className="space-y-5 text-xl md:text-2xl leading-relaxed text-off-white/90 max-w-3xl mx-auto">
            <p>
              Your codebase changes every day. New patterns emerge. Old patterns get deprecated. Dependencies update.
              Conventions evolve. The prompt that generated correct code last month generates incorrect code this month
              because the codebase moved and the prompts didn't.
            </p>

            <p>
              Every tool with static prompts is running on stale knowledge. They're generating code against a mental
              model of your codebase that no longer exists. They don't know about the migration you ran last Tuesday.
              They don't know about the pattern your team adopted last sprint. They don't know about the edge case that
              took down production on Friday.
            </p>

            <p>
              Holy Ship knows. Because Friday's incident updated the prompt chain. Tuesday's migration updated the
              context. Last sprint's pattern is already encoded in the review criteria.
            </p>

            <p className="text-2xl md:text-3xl font-bold text-off-white">
              The system doesn't just keep up with your codebase. It learns from your codebase. Every day it works for
              you, it gets better at working for you.
            </p>
          </div>
        </section>
      </FadeIn>

      <FadeIn>
        <section className="px-6 md:px-16 lg:px-24 py-12 md:py-16 mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-signal-orange mb-12">Mistakes cost you once.</h2>

          <div className="space-y-5 text-xl md:text-2xl leading-relaxed text-off-white/90 max-w-3xl mx-auto">
            <p>
              When a human developer makes a mistake, the fix goes into the code. The lesson goes into that developer's
              head. If they leave, the lesson leaves with them. If a different developer makes the same mistake next
              quarter, you pay for it again.
            </p>

            <p>
              When Holy Ship's pipeline catches a mistake, the fix goes into the code and the lesson goes into the
              prompt chain. It doesn't leave. It doesn't forget. It doesn't take PTO. The next time any agent encounters
              a similar pattern, the prompt chain already knows the answer.
            </p>

            <p className="text-2xl md:text-3xl font-bold text-off-white">
              Every mistake inoculates the system. You pay for it once. Then it never happens again. That's not a
              feature — that's a compounding advantage that grows every single day.
            </p>
          </div>
        </section>
      </FadeIn>
    </>
  );
}
