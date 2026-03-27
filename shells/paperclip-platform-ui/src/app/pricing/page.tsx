import { Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
	title: "Pricing — Paperclip",
	description:
		"Simple pricing. $5/month per agent. No tiers. No gotchas. Pay with Stripe or crypto.",
};

const features = [
	"$5 signup credit included",
	"Managed AI — it just works",
	"Stripe + crypto payments",
	"No API keys needed",
	"Automatic scaling",
];

export default function PricingPage() {
	return (
		<div
			className="min-h-dvh px-6 py-24 text-white"
			style={{ background: "#09090b" }}
		>
			<div className="mx-auto max-w-2xl space-y-12">
				<div className="text-center">
					<Link
						href="/"
						className="text-sm text-indigo-400 no-underline hover:text-indigo-300"
					>
						&larr; Back
					</Link>
					<h1
						className="mt-6 text-4xl font-bold tracking-tight"
						style={{
							fontFamily: "'Space Grotesk', system-ui, sans-serif",
						}}
					>
						Simple pricing
					</h1>
					<p className="mt-3 text-lg text-zinc-400">
						One plan. No tiers. No gotchas.
					</p>
				</div>

				<div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-8 text-center">
					<p className="text-sm uppercase tracking-widest text-zinc-500">
						Paperclip
					</p>
					<p
						className="mt-4 text-6xl font-bold text-indigo-400"
						style={{
							fontFamily: "'Space Grotesk', system-ui, sans-serif",
						}}
					>
						$5
						<span className="text-2xl font-normal text-zinc-500">/month</span>
					</p>
					<p className="mt-2 text-zinc-400">per agent</p>

					<ul className="mt-8 inline-block space-y-3 text-left text-sm">
						{features.map((f) => (
							<li key={f} className="flex items-center gap-2.5 text-zinc-300">
								<Check className="size-4 shrink-0 text-indigo-400" />
								{f}
							</li>
						))}
					</ul>

					<div className="mt-8">
						<Link
							href="/billing/plans"
							className="inline-block rounded-lg bg-indigo-500 px-8 py-3 text-sm font-semibold text-white no-underline hover:bg-indigo-400 transition-colors"
						>
							Get Started
						</Link>
					</div>
				</div>

				<div className="space-y-4">
					<h2
						className="text-xl font-semibold"
						style={{
							fontFamily: "'Space Grotesk', system-ui, sans-serif",
						}}
					>
						Usage rates
					</h2>
					<p className="text-sm text-zinc-400">
						Credits are consumed at transparent per-use rates. No markup
						surprises.
					</p>
					<div className="rounded-lg border border-zinc-800 overflow-hidden">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b border-zinc-800 bg-zinc-900/50">
									<th className="px-4 py-3 text-left font-medium text-zinc-400">
										Usage
									</th>
									<th className="px-4 py-3 text-right font-medium text-zinc-400">
										Rate
									</th>
								</tr>
							</thead>
							<tbody>
								<tr className="border-b border-zinc-800/50">
									<td className="px-4 py-3 text-zinc-300">Input tokens</td>
									<td className="px-4 py-3 text-right font-mono text-zinc-400">
										$0.80 / 1M tokens
									</td>
								</tr>
								<tr>
									<td className="px-4 py-3 text-zinc-300">Output tokens</td>
									<td className="px-4 py-3 text-right font-mono text-zinc-400">
										$4.68 / 1M tokens
									</td>
								</tr>
							</tbody>
						</table>
					</div>
					<p className="text-xs text-zinc-500">
						Rates pulled from your dashboard. See billing for exact costs.
					</p>
				</div>

				<div className="text-center text-sm text-zinc-500">
					<p>
						Questions?{" "}
						<a
							href="mailto:support@runpaperclip.com"
							className="text-indigo-400 no-underline hover:text-indigo-300"
						>
							support@runpaperclip.com
						</a>
					</p>
				</div>
			</div>
		</div>
	);
}
