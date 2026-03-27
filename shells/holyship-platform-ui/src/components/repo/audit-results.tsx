"use client";

import { useState } from "react";
import { createAllIssues, createIssueFromGap } from "@/lib/holyship-client";
import type { ProposedIssue } from "@/lib/types";

interface AuditResultsProps {
	issues: ProposedIssue[];
	owner: string;
	repo: string;
	onRerun: () => void;
}

const priorityColors: Record<string, string> = {
	critical: "bg-red-600/20 text-red-400",
	high: "bg-amber-600/20 text-amber-400",
	medium: "bg-sky-600/20 text-sky-400",
	low: "bg-zinc-600/20 text-zinc-400",
};

const categoryColors: Record<string, string> = {
	code_quality: "bg-green-600/20 text-green-400",
	security: "bg-red-600/20 text-red-400",
	test_coverage: "bg-sky-600/20 text-sky-400",
	ecosystem: "bg-amber-600/20 text-amber-400",
	tech_debt: "bg-zinc-600/20 text-zinc-400",
};

const categoryLabels: Record<string, string> = {
	code_quality: "Code Quality",
	security: "Security",
	test_coverage: "Test Coverage",
	ecosystem: "Ecosystem",
	tech_debt: "Tech Debt",
};

function countByPriority(issues: ProposedIssue[]) {
	const counts: Record<string, number> = {};
	for (const issue of issues) {
		counts[issue.priority] = (counts[issue.priority] ?? 0) + 1;
	}
	return counts;
}

export function AuditResults({
	issues,
	owner,
	repo,
	onRerun,
}: AuditResultsProps) {
	const [creating, setCreating] = useState<Set<number>>(new Set());
	const [creatingAll, setCreatingAll] = useState(false);
	const [shippingAll, setShippingAll] = useState(false);

	const counts = countByPriority(issues);
	const priorityOrder = ["critical", "high", "medium", "low"];

	async function handleCreateSingle(index: number, issue: ProposedIssue) {
		setCreating((prev) => new Set(prev).add(index));
		try {
			await createIssueFromGap(owner, repo, issue.title);
		} finally {
			setCreating((prev) => {
				const next = new Set(prev);
				next.delete(index);
				return next;
			});
		}
	}

	async function handleCreateAll(ship: boolean) {
		if (ship) setShippingAll(true);
		else setCreatingAll(true);
		try {
			await createAllIssues(owner, repo, ship);
		} finally {
			setCreatingAll(false);
			setShippingAll(false);
		}
	}

	return (
		<div className="space-y-4">
			{/* Priority summary bar */}
			<div className="flex flex-wrap gap-2">
				{priorityOrder.map((p) =>
					counts[p] ? (
						<span
							key={p}
							className={`rounded-full px-3 py-1 text-xs font-semibold ${priorityColors[p]}`}
						>
							{counts[p]} {p}
						</span>
					) : null,
				)}
			</div>

			{/* Issue list */}
			<div className="space-y-2">
				{issues.map((issue, i) => (
					<div
						key={`${issue.title}-${issue.file ?? ""}-${issue.line ?? i}`}
						className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
					>
						<div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
							<span
								className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${priorityColors[issue.priority]}`}
							>
								{issue.priority}
							</span>
							<span
								className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${categoryColors[issue.category]}`}
							>
								{categoryLabels[issue.category] ?? issue.category}
							</span>
							<span className="truncate text-sm font-medium text-card-foreground">
								{issue.title}
							</span>
							{issue.file && (
								<span className="truncate text-xs font-mono text-muted-foreground">
									{issue.file}
									{issue.line != null ? `:${issue.line}` : ""}
								</span>
							)}
						</div>
						<button
							type="button"
							onClick={() => handleCreateSingle(i, issue)}
							disabled={creating.has(i)}
							className="shrink-0 rounded-md border border-border px-3 py-1 text-xs font-medium text-card-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
						>
							{creating.has(i) ? "Creating..." : "Create Issue"}
						</button>
					</div>
				))}
			</div>

			{/* Bottom action bar */}
			<div className="flex items-center justify-between border-t border-border pt-4">
				<button
					type="button"
					onClick={onRerun}
					className="rounded-md border border-border px-4 py-2 text-sm font-medium text-card-foreground transition-colors hover:border-muted-foreground"
				>
					Re-run Audit
				</button>
				<div className="flex gap-2">
					<button
						type="button"
						onClick={() => handleCreateAll(false)}
						disabled={creatingAll || shippingAll}
						className="rounded-md border border-green-500 px-4 py-2 text-sm font-medium text-green-400 transition-colors hover:bg-green-500/10 disabled:opacity-50"
					>
						{creatingAll ? "Creating..." : "Create All Issues"}
					</button>
					<button
						type="button"
						onClick={() => handleCreateAll(true)}
						disabled={creatingAll || shippingAll}
						className="rounded-md bg-green-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
					>
						{shippingAll ? "Shipping..." : "Create All & Ship"}
					</button>
				</div>
			</div>
		</div>
	);
}
