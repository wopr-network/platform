export function LandingFooter() {
	return (
		<footer className="px-6 md:px-16 lg:px-24 py-16 flex justify-center gap-8 text-off-white/50 text-sm">
			<a
				href="/how-it-works"
				className="hover:text-signal-orange transition-colors"
			>
				How It Works
			</a>
			<a
				href="/the-real-cost"
				className="hover:text-signal-orange transition-colors"
			>
				The Real Cost
			</a>
			<a
				href="/the-learning-loop"
				className="hover:text-signal-orange transition-colors"
			>
				The Learning Loop
			</a>
			<a
				href="/vibe-coding-vs-engineering"
				className="hover:text-signal-orange transition-colors"
			>
				Vibe Coding vs. Engineering
			</a>
			<a
				href="https://github.com/wopr-network/holyship"
				className="hover:text-signal-orange transition-colors"
				target="_blank"
				rel="noopener noreferrer"
			>
				GitHub
			</a>
			<a
				href="https://github.com/wopr-network/holyship/tree/main/docs"
				className="hover:text-signal-orange transition-colors"
				target="_blank"
				rel="noopener noreferrer"
			>
				Docs
			</a>
		</footer>
	);
}
