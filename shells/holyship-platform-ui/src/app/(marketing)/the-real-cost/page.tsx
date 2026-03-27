"use client";

import { FadeIn } from "@/components/landing";
import { CostCurve } from "@/components/landing/cost-curve";

export default function TheRealCostPage() {
	return (
		<>
			<section className="pt-10 md:pt-16 pb-12 flex flex-col justify-center items-center text-center px-6 md:px-16 lg:px-24">
				<h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight text-off-white max-w-4xl">
					The real cost.
				</h1>
			</section>

			<section className="px-6 md:px-16 lg:px-24 pt-4 pb-12 mx-auto text-center">
				<div className="space-y-5 text-xl md:text-2xl leading-relaxed text-off-white/90 max-w-3xl mx-auto">
					<p>
						Software bugs cost the US economy{" "}
						<a
							href="https://www.nist.gov/document/report02-3pdf"
							target="_blank"
							rel="noopener noreferrer"
							className="underline decoration-off-white/20 hover:decoration-signal-orange transition-colors"
						>
							$59.5 billion a year
						</a>
						. That's not a typo and it's not from a blog post — it's a
						peer-reviewed NIST study. The average production outage costs{" "}
						<a
							href="https://itic-corp.com/itic-2024-hourly-cost-of-downtime-report/"
							target="_blank"
							rel="noopener noreferrer"
							className="underline decoration-off-white/20 hover:decoration-signal-orange transition-colors"
						>
							$14,000 per minute
						</a>
						. For large enterprises, $23,750. Per minute.
					</p>

					<p>
						Everyone knows bugs are expensive. That's not news. The news is
						where the money actually goes.
					</p>
				</div>
			</section>

			<FadeIn>
				<section className="px-6 md:px-16 lg:px-24 py-12 md:py-16 mx-auto text-center">
					<h2 className="text-3xl md:text-4xl font-bold text-signal-orange mb-12">
						Writing code is cheap. Correcting code is where you go broke.
					</h2>

					<div className="space-y-5 text-xl md:text-2xl leading-relaxed text-off-white/90 max-w-3xl mx-auto">
						<p>
							Across real codebases, AI agents average 2.8 review/fix cycles for
							every 1 spec/code cycle. That's not a bug in our system — that's
							the measured reality of AI writing code against complex,
							production codebases. Every tool has this number. Most don't
							measure it. None of them tell you about it.
						</p>

						<p>
							The first draft is never right. The second draft is closer. The
							third draft passes. That's not failure — that's how software gets
							written. By humans too. The difference is whether those correction
							cycles happen inside a pipeline that costs you compute, or inside
							a Slack thread that costs you engineers. And whether they take
							hours or weeks.
						</p>

						<p>
							A human review/fix cycle is a calendar day. Best case. Reviewer
							has context-switching overhead. Developer has to remember what
							they wrote. Back and forth in comments. Three cycles means three
							days — if nobody's on vacation, if nobody's blocked, if nobody's
							in a different timezone.
						</p>

						<p className="text-2xl md:text-3xl font-bold text-off-white">
							The same three cycles inside Holy Ship take hours. Not business
							hours — wall clock hours. The agent writes, the gate evaluates,
							the agent corrects, the gate evaluates again. No context
							switching. No waiting for review. No Slack thread. No standup to
							discuss it. Hours to done, with mathematical proof of correctness.
							Not days to done with engineering hope.
						</p>
					</div>
				</section>
			</FadeIn>

			<FadeIn>
				<section className="px-6 md:px-16 lg:px-24 py-12 md:py-16 mx-auto text-center">
					<h2 className="text-3xl md:text-4xl font-bold text-signal-orange mb-12">
						Pay now, or pay 100x later.
					</h2>

					<div className="space-y-5 text-xl md:text-2xl leading-relaxed text-off-white/90 max-w-3xl mx-auto">
						<p>
							If the spec is wrong and nobody catches it, the coder builds the
							wrong thing. The reviewer approves the wrong thing. The tests
							validate the wrong thing. It ships. It breaks billing. Three
							engineers spend two days finding the root cause. The fix takes six
							minutes.
						</p>

						<p>
							A defect caught in requirements costs you one review. The same
							defect caught in production costs you an incident, a postmortem,
							three engineers, and a customer apology.
						</p>

						<p>
							<a
								href="https://staff.emu.edu.tr/alexanderchefranov/Documents/CMPE412/Boehm1981%20COCOMO.pdf"
								target="_blank"
								rel="noopener noreferrer"
								className="underline decoration-off-white/20 hover:decoration-signal-orange transition-colors"
							>
								Forty years of measured data
							</a>{" "}
							across thousands of projects say the same thing: every stage you
							skip multiplies the cost by an order of magnitude. This is not a
							philosophy. It's arithmetic.
						</p>
					</div>
				</section>
			</FadeIn>

			<FadeIn>
				<section className="px-6 md:px-16 lg:px-24 py-12 md:py-16 mx-auto">
					<CostCurve />
				</section>
			</FadeIn>

			<FadeIn>
				<section className="px-6 md:px-16 lg:px-24 py-12 md:py-16 mx-auto text-center">
					<h2 className="text-3xl md:text-4xl font-bold text-signal-orange mb-12">
						The curve goes down.
					</h2>

					<div className="space-y-5 text-xl md:text-2xl leading-relaxed text-off-white/90 max-w-3xl mx-auto">
						<p>
							Holy Ship doesn't eliminate correction cycles — nothing does. Code
							is rewritten, that's the nature of the work. What we did is make
							each cycle deterministic, automated, and cheap. And then we did
							something nobody else does: we made the system learn.
						</p>

						<p>
							Every gate failure updates the prompt chain. The spec template
							learns from spec rejections. The code template learns from test
							failures. The review criteria learn from every bug that ever cost
							you money. These aren't static prompts on disk — they're a living
							ecosystem of engineering knowledge that evolves with your
							codebase.
						</p>

						<p>
							The first issue takes three correction cycles. The tenth takes
							two. The hundredth takes one. The system compounds. Every mistake
							costs you once — then the system inoculates itself so that mistake
							never happens again.
						</p>

						<p>
							<a
								href="https://www.ppi-int.com/wp-content/uploads/2021/01/Software-Defect-Removal-Efficiency.pdf"
								target="_blank"
								rel="noopener noreferrer"
								className="underline decoration-off-white/20 hover:decoration-signal-orange transition-colors"
							>
								Formal inspections catch 60-65% of defects
							</a>
							. Testing alone catches 30%. Combined — inspections, static
							analysis, and testing together — catches over 95%. Holy Ship runs
							all three. Every time. On every issue. And each time, the prompts
							that drive those inspections are sharper than the last.
						</p>

						<p className="text-2xl md:text-3xl font-bold text-off-white">
							The cost curve doesn't flatten. It trends down. Every issue you
							ship makes the next one cheaper, faster, and more correct.
						</p>
					</div>
				</section>
			</FadeIn>

			<FadeIn>
				<section className="px-6 md:px-16 lg:px-24 py-12 md:py-16 mx-auto text-center">
					<h2 className="text-3xl md:text-4xl font-bold text-signal-orange mb-12">
						The math.
					</h2>

					<div className="space-y-5 text-xl md:text-2xl leading-relaxed text-off-white/90 max-w-3xl mx-auto">
						<p>
							2.8 correction cycles per issue, caught and resolved
							automatically, costs you compute time. The same 2.8 cycles caught
							by humans costs you engineering hours. The same defects caught in
							production costs you $14,000 per minute of downtime.
						</p>

						<p>Same bugs. Same corrections. Radically different price.</p>

						<p className="text-2xl md:text-3xl font-bold text-off-white">
							You went home. It just worked. Holy Ship.
						</p>
					</div>
				</section>
			</FadeIn>
		</>
	);
}
