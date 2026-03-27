"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";

import { AuditForm } from "@/components/repo/audit-form";
import { AuditResults } from "@/components/repo/audit-results";
import { getRepoConfig, runAudit } from "@/lib/holyship-client";
import type { AuditCategory, ProposedIssue } from "@/lib/types";

export default function StoriesPage({
	params,
}: {
	params: Promise<{ owner: string; repo: string }>;
}) {
	const { owner, repo } = use(params);

	const [analyzed, setAnalyzed] = useState<boolean | null>(null);
	const [auditLoading, setAuditLoading] = useState(false);
	const [results, setResults] = useState<ProposedIssue[] | null>(null);

	useEffect(() => {
		let cancelled = false;
		getRepoConfig(owner, repo).then((config) => {
			if (!cancelled) setAnalyzed(config !== null);
		});
		return () => {
			cancelled = true;
		};
	}, [owner, repo]);

	async function handleSubmit(
		categories: AuditCategory[],
		customInstructions?: string,
	) {
		setAuditLoading(true);
		try {
			const data = await runAudit(owner, repo, categories, customInstructions);
			setResults(data.issues);
		} finally {
			setAuditLoading(false);
		}
	}

	function handleRerun() {
		setResults(null);
	}

	// Loading state
	if (analyzed === null) {
		return <p className="text-muted-foreground">Loading...</p>;
	}

	// Not analyzed yet
	if (!analyzed) {
		return (
			<div className="flex items-center justify-center py-20">
				<div className="rounded-lg border border-border bg-card p-8 text-center max-w-md">
					<svg
						aria-hidden="true"
						className="mx-auto mb-4 h-10 w-10 text-muted-foreground"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						strokeWidth={1.5}
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
						/>
					</svg>
					<h2 className="text-lg font-bold text-card-foreground mb-1">
						Run Analyze first
					</h2>
					<p className="text-sm text-muted-foreground mb-4">
						This repo hasn&apos;t been analyzed yet. Analyze it to unlock story
						generation.
					</p>
					<Link
						href={`/dashboard/${owner}/${repo}/analyze`}
						className="inline-block rounded-lg bg-primary px-6 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
					>
						Go to Analyze
					</Link>
				</div>
			</div>
		);
	}

	// Input + results
	return (
		<div className="max-w-3xl space-y-6">
			<AuditForm loading={auditLoading} onSubmit={handleSubmit} />

			{results && (
				<AuditResults
					issues={results}
					owner={owner}
					repo={repo}
					onRerun={handleRerun}
				/>
			)}
		</div>
	);
}
