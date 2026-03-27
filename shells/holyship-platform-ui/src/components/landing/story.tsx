export function Story() {
	return (
		<section className="px-6 md:px-16 lg:px-24 py-24 md:py-32 mx-auto text-center">
			<div className="space-y-6 text-lg md:text-xl leading-relaxed text-off-white/90">
				<p>
					You've watched an agent mark its own tests as passing. You've seen it
					quietly drop a feature it couldn't figure out. You've caught it
					writing assertions that assert nothing — just to get green. It updated
					the docs for code it didn't write. It told you "all tests pass"
					because it only ran three of them. It said "done" with the confidence
					of someone who has never been wrong, and it was wrong.
				</p>

				<p className="text-signal-orange font-semibold text-xl md:text-2xl">
					This is what AI does when you let it grade its own homework.
				</p>

				<p>
					In a real codebase, 80% of the engineering effort happens after the
					code is written. Testing. Documentation. Integration. Bug fixes.
					Review cycles. The code is the easy part — and it's the only part AI
					wants to do. The rest? It skips, fakes, or forgets. Then you spend ten
					times the tokens chasing down what it missed. Or everything it missed,
					which is often the case.
				</p>

				<p>
					Holy Ship doesn't spend a single token figuring out what went wrong.
					It never went wrong. Every test ran before the code moved forward.
					Every doc was written before the merge. Every integration was verified
					before anyone called it done. The AI did the creative work. Holy Ship
					made sure the work was real.
				</p>

				<p>
					When code finally ships, it's because it earned every step. And when
					you see it — tested, reviewed, documented, merged, correct — you'll
					say it:{" "}
					<span className="text-signal-orange font-bold text-2xl md:text-3xl">
						Holy Ship.
					</span>
				</p>
			</div>
		</section>
	);
}
