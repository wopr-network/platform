import type { Metadata } from "next";
import { FadeIn } from "@/components/landing";

export const metadata: Metadata = {
  title: "Proof — One Person. Two Months. Four Products.",
  description:
    "97 repos. 1,903 PRs. 2,393 commits. 65 plugins. 4 products in production. One person. Two months. Holy Ship ships Holy Ship.",
};

const stats = [
  { value: "97", label: "Repos" },
  { value: "1,903", label: "PRs merged" },
  { value: "2,393", label: "Commits" },
  { value: "65", label: "Plugins" },
  { value: "4", label: "Products in production" },
  { value: "1", label: "Person" },
];

export default function ProofPage() {
  return (
    <>
      <section className="pt-16 md:pt-24 pb-8 flex flex-col justify-center items-center text-center px-6 md:px-16 lg:px-24">
        <p className="text-lg md:text-xl text-off-white/40 mb-6">
          The floor holds. Here's the proof.
        </p>
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-tight text-off-white max-w-4xl">
          One person.{" "}
          <span className="text-signal-orange">Two months.</span>
        </h1>
      </section>

      <FadeIn>
        <section className="px-6 md:px-16 lg:px-24 py-16 md:py-24 mx-auto max-w-5xl">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-8 md:gap-12">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-4xl md:text-6xl font-black text-signal-orange">{stat.value}</p>
                <p className="text-base md:text-lg text-off-white/40 mt-2">{stat.label}</p>
              </div>
            ))}
          </div>
        </section>
      </FadeIn>

      <FadeIn>
        <section className="px-6 md:px-16 lg:px-24 py-12 md:py-16 mx-auto text-center max-w-3xl">
          <p className="text-2xl md:text-3xl leading-relaxed text-off-white/90">
            Holy Ship ships Holy Ship. The product was built by the product. Not a demo. Not a
            prototype. Four production deployments serving real users, built by one founder using
            the same pipeline you're looking at right now.
          </p>
        </section>
      </FadeIn>

      <FadeIn>
        <section className="px-6 md:px-16 lg:px-24 py-12 md:py-16 mx-auto max-w-3xl">
          <h2 className="text-3xl md:text-4xl font-bold text-signal-orange mb-12 text-center">
            The products.
          </h2>

          <div className="space-y-8">
            <div>
              <p className="text-xl md:text-2xl font-bold text-off-white">WOPR</p>
              <p className="text-lg text-off-white/50 mt-1">
                AI agent orchestration. 65 plugins. Voice, vision, code execution, web search,
                WhatsApp, Discord, Slack. 439 PRs. Production.
              </p>
            </div>
            <div>
              <p className="text-xl md:text-2xl font-bold text-off-white">RunPaperclip</p>
              <p className="text-lg text-off-white/50 mt-1">
                Zero-human company orchestration. Managed containers, auth bridge, crypto billing.
                Full E2E from signup to running CEO agent. Production.
              </p>
            </div>
            <div>
              <p className="text-xl md:text-2xl font-bold text-off-white">NemoPod</p>
              <p className="text-lg text-off-white/50 mt-1">
                GPU-powered AI inference. NVIDIA container management, metered billing, model
                routing. Production.
              </p>
            </div>
            <div>
              <p className="text-xl md:text-2xl font-bold text-off-white">Holy Ship</p>
              <p className="text-lg text-off-white/50 mt-1">
                The engine that built all of the above. Flow-based pipeline, deterministic gates,
                learning loop, crash-proof state. Production.
              </p>
            </div>
          </div>
        </section>
      </FadeIn>

      <FadeIn>
        <section className="px-6 md:px-16 lg:px-24 py-12 md:py-16 mx-auto text-center max-w-3xl">
          <h2 className="text-3xl md:text-4xl font-bold text-signal-orange mb-12">
            The math doesn't lie.
          </h2>

          <div className="space-y-5 text-xl md:text-2xl leading-relaxed text-off-white/90">
            <p>
              A 20-person engineering team ships maybe 50 PRs a week on a good week. That's 400 in
              two months. One person shipped 1,903. Not by working harder. Not by being smarter. By
              having a floor.
            </p>

            <p className="text-2xl md:text-3xl font-bold text-off-white">
              The AI brought the peaks. The pipeline caught the valleys. The floor held.
            </p>
            <p className="text-off-white/40">
              Same models everyone uses. Same 24 hours in a day. Different engineering.
            </p>
          </div>
        </section>
      </FadeIn>

      <FadeIn>
        <section className="px-6 md:px-16 lg:px-24 py-16 md:py-24 mx-auto text-center">
          <p className="text-2xl md:text-3xl font-bold text-off-white max-w-3xl mx-auto leading-relaxed">
            This isn't a pitch deck. It's a git log. Go&nbsp;look.
          </p>

          <div className="mt-10 flex flex-col items-center gap-4">
            <a
              href="/login"
              className="inline-block px-10 py-4 bg-signal-orange text-near-black font-semibold text-lg rounded hover:opacity-90 transition-opacity"
            >
              Get Started
            </a>
            <a
              href="https://github.com/wopr-network"
              target="_blank"
              rel="noopener noreferrer"
              className="text-off-white/40 hover:text-signal-orange transition-colors text-sm"
            >
              github.com/wopr-network &rarr;
            </a>
          </div>
        </section>
      </FadeIn>
    </>
  );
}
