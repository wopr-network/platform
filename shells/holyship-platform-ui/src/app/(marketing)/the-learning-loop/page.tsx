import type { Metadata } from "next";
import { FadeIn } from "@/components/landing";

export const metadata: Metadata = {
  title: "The Learning Loop — Every Gate Failure Makes a Prompt Smarter",
  description:
    "Templated prompts pull from an ever-evolving knowledge base. Every gate failure teaches the system. Issue #100 costs a fraction of issue #1. The floor rises automatically.",
};

export default function TheLearningLoopPage() {
  return (
    <>
      <section className="pt-10 md:pt-16 pb-12 flex flex-col justify-center items-center text-center px-6 md:px-16 lg:px-24">
        <p className="text-lg md:text-xl text-off-white/40 mb-6">The floor rises. Every issue. Automatically.</p>
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
          <h2 className="text-3xl md:text-4xl font-bold text-signal-orange mb-12">The mechanism.</h2>

          <div className="space-y-5 text-xl md:text-2xl leading-relaxed text-off-white/90 max-w-3xl mx-auto">
            <p>
              Every prompt in Holy Ship is a template. Not a static file — a template that pulls from a living knowledge
              base. Your API conventions, your error handling patterns, your naming rules, your past mistakes — all
              indexed, all searchable, all injected into the prompt at the moment the agent needs them.
            </p>

            <p>
              The template is the skeleton. The knowledge base is the brain. Together they produce a prompt that is
              specific to your codebase, your domain, and the exact task being done right now.
            </p>

            <p className="text-2xl md:text-3xl font-bold text-off-white">
              Template + knowledge base = a prompt that evolves without anyone touching it.
            </p>
          </div>
        </section>
      </FadeIn>

      <FadeIn>
        <section className="px-6 md:px-16 lg:px-24 py-12 md:py-16 mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-signal-orange mb-12">Gate fails. Prompt gets better.</h2>

          <div className="space-y-5 text-xl md:text-2xl leading-relaxed text-off-white/90 max-w-3xl mx-auto">
            <p>
              The agent writes code. The gate rejects it — tests fail, lint catches a pattern violation, the review
              finds a security issue. That rejection isn't just feedback to the agent. It's feedback to the system.
            </p>

            <p>
              The failure gets recorded. The knowledge base learns: "this codebase throws on missing data, never
              defaults." Next time any agent touches that pattern, the prompt already knows. The gate doesn't need to
              catch it again. The agent gets it right the first time.
            </p>

            <p className="text-2xl md:text-3xl font-bold text-off-white">
              Every gate failure is a prompt getting smarter.
            </p>
            <p className="text-off-white/40">
              The gate didn't just protect the codebase. It taught the system. That's the loop. That's why the floor
              rises.
            </p>
          </div>
        </section>
      </FadeIn>

      <FadeIn>
        <section className="px-6 md:px-16 lg:px-24 py-12 md:py-16 mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-signal-orange mb-12">What updates.</h2>

          <div className="space-y-5 text-xl md:text-2xl leading-relaxed text-off-white/90 max-w-3xl mx-auto">
            <p>
              Spec rejected? The spec template learns what was missing. Tests fail? The code template learns what was
              assumed. Review catches a violation? The review criteria get sharper. Production incident? That edge case
              gets encoded into the pipeline permanently.
            </p>

            <p>
              Every layer has its own prompt chain. Spec. Architecture. Implementation. Testing. Review. Documentation.
              Each one evolves independently based on what actually happened — not what someone guessed would happen.
            </p>

            <p className="text-2xl md:text-3xl font-bold text-off-white">
              We don't fine-tune the model. We fine-tune the engineering around it.
            </p>
            <p className="text-off-white/40">
              Same models everyone uses. Different instructions, different context, different guardrails. The part that
              actually determines whether the output is correct.
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
              The cost curve doesn't flatten. It trends down.
            </p>
            <p className="text-off-white/40">
              Three cycles. Two cycles. One cycle. Same models. Smarter engineering. Cheaper tokens. Higher floor.
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
              Every tool with static prompts is running on stale knowledge. They don't know about the migration you ran
              last Tuesday. They don't know about the pattern your team adopted last sprint. They don't know about the
              edge case that took down production on Friday.
            </p>

            <p className="text-2xl md:text-3xl font-bold text-off-white">Their prompts rot. Ours evolve.</p>
            <p className="text-off-white/40">
              Friday's incident is already in the knowledge base. Tuesday's migration is already in the context. The
              prompt that fires tomorrow is smarter than the prompt that fired today. Automatically. Without anyone
              touching it.
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
              Every mistake inoculates the system. You pay for it once. Then it never happens again.
            </p>
            <p className="text-off-white/40">
              Developers leave. The lesson leaves with them. The pipeline doesn't leave. The pipeline doesn't forget.
              The pipeline doesn't take PTO.
            </p>
          </div>
        </section>
      </FadeIn>
    </>
  );
}
