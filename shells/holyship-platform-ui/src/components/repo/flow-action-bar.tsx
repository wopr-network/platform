"use client";

interface FlowActionBarProps {
	changeCount: number;
	onDiscard: () => void;
	onApply: () => void;
	applying: boolean;
	appliedPr: { url: string; number: number } | null;
}

export function FlowActionBar({
	changeCount,
	onDiscard,
	onApply,
	applying,
	appliedPr,
}: FlowActionBarProps) {
	if (appliedPr) {
		return (
			<div className="flex items-center justify-between rounded-lg border border-green-500/20 bg-green-500/5 px-4 py-3">
				<span className="text-sm text-green-400">
					PR #{appliedPr.number} created
				</span>
				<a
					href={appliedPr.url}
					target="_blank"
					rel="noopener noreferrer"
					className="text-sm font-semibold text-green-400 hover:underline"
				>
					View PR &rarr;
				</a>
			</div>
		);
	}

	return (
		<div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
			<span className="text-xs text-muted-foreground">
				{changeCount} pending {changeCount === 1 ? "change" : "changes"}
			</span>
			<div className="flex gap-2">
				<button
					type="button"
					onClick={onDiscard}
					disabled={applying}
					className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 disabled:opacity-50"
				>
					Discard
				</button>
				<button
					type="button"
					onClick={onApply}
					disabled={applying}
					className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-green-700 disabled:opacity-50"
				>
					{applying ? "Creating PR..." : "Apply \u2192 Create PR"}
				</button>
			</div>
		</div>
	);
}
