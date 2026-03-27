import Link from "next/link";
import type { RepoSummary } from "@/lib/types";

interface RepoCardProps {
	repo: RepoSummary;
}

export function RepoCard({ repo }: RepoCardProps) {
	const analyzed = !!repo.analyzed;

	const summaryParts: string[] = [];
	if (repo.config) {
		if (repo.config.languages.length > 0) {
			summaryParts.push(repo.config.languages.join(", "));
		}
		if (repo.config.ci.supported && repo.config.ci.provider) {
			summaryParts.push(repo.config.ci.provider);
		}
	}

	return (
		<Link
			href={`/dashboard/${repo.full_name}`}
			className="block rounded-xl border border-border bg-card p-4 hover:border-primary/30 transition-colors"
		>
			<div className="flex items-start justify-between gap-3">
				<h3 className="font-bold text-card-foreground truncate">
					{repo.full_name}
				</h3>
				{analyzed ? (
					<span className="shrink-0 rounded-full bg-green-600/20 text-green-400 px-2.5 py-0.5 text-xs font-medium">
						Analyzed
					</span>
				) : (
					<span className="shrink-0 rounded-full bg-amber-600/20 text-amber-400 px-2.5 py-0.5 text-xs font-medium">
						Not Analyzed
					</span>
				)}
			</div>

			{analyzed && summaryParts.length > 0 && (
				<p className="mt-2 text-sm text-muted-foreground truncate">
					{summaryParts.join(" · ")}
				</p>
			)}

			{analyzed ? (
				<p className="mt-3 text-sm text-muted-foreground">
					<span className="text-card-foreground font-medium">
						{repo.inFlight ?? 0}
					</span>{" "}
					in flight{" · "}
					<span className="text-card-foreground font-medium">
						{repo.shippedToday ?? 0}
					</span>{" "}
					shipped today{" · "}
					<span className="text-card-foreground font-medium">
						{repo.openGaps ?? 0}
					</span>{" "}
					gaps open
				</p>
			) : (
				<p className="mt-3 text-sm font-medium text-amber-400">
					Click to analyze &rarr;
				</p>
			)}
		</Link>
	);
}
