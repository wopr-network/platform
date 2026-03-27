"use client";

import { useCallback, useEffect, useState } from "react";

interface Stage {
	name: string;
	label: string;
	description: string;
	enabled: boolean;
	approvalRequired: boolean;
	isTerminal?: boolean;
}

const DEFAULT_STAGES: Stage[] = [
	{
		name: "spec",
		label: "Spec",
		description: "Architect writes a detailed specification",
		enabled: true,
		approvalRequired: false,
	},
	{
		name: "coding",
		label: "Code",
		description: "Coder implements the spec",
		enabled: true,
		approvalRequired: false,
	},
	{
		name: "reviewing",
		label: "Review",
		description: "Reviewer checks code quality and correctness",
		enabled: true,
		approvalRequired: false,
	},
	{
		name: "fixing",
		label: "Fix",
		description: "Fix issues found during review (loops back to review)",
		enabled: true,
		approvalRequired: false,
	},
	{
		name: "documentation",
		label: "Docs",
		description: "Write or update documentation",
		enabled: true,
		approvalRequired: false,
	},
	{
		name: "learning",
		label: "Learn",
		description: "Extract patterns and learnings for future work",
		enabled: true,
		approvalRequired: false,
	},
	{
		name: "merging",
		label: "Merge",
		description: "Merge the PR into the target branch",
		enabled: true,
		approvalRequired: false,
	},
];

export default function PipelinePage() {
	const [stages, setStages] = useState<Stage[]>(DEFAULT_STAGES);
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);
	const [flowName, _setFlowName] = useState("engineering");

	// Load current flow config
	useEffect(() => {
		fetch(
			`/api/trpc/flow.get?input=${encodeURIComponent(JSON.stringify({ name: flowName }))}`,
		)
			.then((r) => r.json())
			.then((data) => {
				if (data?.result?.data) {
					const flow = data.result.data;
					setStages((prev) =>
						prev.map((stage) => {
							const state = flow.states?.find(
								(s: { name: string; promptTemplate?: string | null }) =>
									s.name === stage.name,
							);
							if (!state) return stage;
							return {
								...stage,
								enabled: !!state.promptTemplate,
								// Check if there's an approval gate on transitions TO this state
								approvalRequired:
									flow.transitions?.some(
										(t: { toState: string; gateId?: string | null }) =>
											t.toState === stage.name && t.gateId,
									) ?? false,
							};
						}),
					);
				}
			})
			.catch(() => {});
	}, [flowName]);

	const toggleStage = useCallback((name: string) => {
		setStages((prev) =>
			prev.map((s) => (s.name === name ? { ...s, enabled: !s.enabled } : s)),
		);
		setSaved(false);
	}, []);

	const toggleApproval = useCallback((name: string) => {
		setStages((prev) =>
			prev.map((s) =>
				s.name === name ? { ...s, approvalRequired: !s.approvalRequired } : s,
			),
		);
		setSaved(false);
	}, []);

	async function saveConfig() {
		setSaving(true);
		try {
			await fetch("/api/pipeline/configure", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					flowName,
					stages: stages.map((s) => ({
						name: s.name,
						enabled: s.enabled,
						approvalRequired: s.approvalRequired,
					})),
				}),
			});
			setSaved(true);
		} finally {
			setSaving(false);
		}
	}

	// Find the last enabled stage
	const lastEnabledIdx = stages.reduce(
		(acc, s, i) => (s.enabled ? i : acc),
		-1,
	);

	// Count enabled stages
	const enabledCount = stages.filter((s) => s.enabled).length;
	const approvalCount = stages.filter(
		(s) => s.enabled && s.approvalRequired,
	).length;

	return (
		<div className="max-w-3xl">
			<p className="text-muted-foreground mb-8">
				Configure which stages run and where you want to review before
				proceeding.
			</p>

			{/* Pipeline visualization */}
			<div className="space-y-1 mb-8">
				{stages.map((stage, idx) => {
					const isLast = idx === lastEnabledIdx;
					const nextEnabled = stages.slice(idx + 1).find((s) => s.enabled);

					return (
						<div key={stage.name}>
							<div
								className={`flex items-center justify-between rounded-lg border p-4 transition-all ${
									stage.enabled
										? "bg-background border-border"
										: "bg-muted/30 border-transparent opacity-50"
								}`}
							>
								{/* Left: toggle + info */}
								<div className="flex items-center gap-4">
									<button
										type="button"
										onClick={() => toggleStage(stage.name)}
										className={`relative w-12 h-6 rounded-full transition-colors ${
											stage.enabled ? "bg-green-600" : "bg-muted"
										}`}
									>
										<span
											className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
												stage.enabled ? "translate-x-6" : "translate-x-0.5"
											}`}
										/>
									</button>
									<div>
										<span className="font-medium">{stage.label}</span>
										<p className="text-sm text-muted-foreground">
											{stage.description}
										</p>
									</div>
								</div>

								{/* Right: approval toggle */}
								{stage.enabled && (
									<button
										type="button"
										onClick={() => toggleApproval(stage.name)}
										className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
											stage.approvalRequired
												? "bg-amber-600/20 text-amber-400 border border-amber-600/40"
												: "bg-muted text-muted-foreground hover:text-foreground"
										}`}
									>
										{stage.approvalRequired ? "Approval required" : "Auto"}
									</button>
								)}
							</div>

							{/* Connector arrow */}
							{stage.enabled && nextEnabled && (
								<div className="flex justify-center py-1">
									<div className="flex flex-col items-center">
										{stage.approvalRequired && (
											<span className="text-xs text-amber-400 font-medium mb-0.5">
												waits for approval
											</span>
										)}
										<svg
											aria-hidden="true"
											width="16"
											height="16"
											viewBox="0 0 16 16"
											className="text-muted-foreground"
										>
											<path
												d="M8 2 L8 14 M4 10 L8 14 L12 10"
												stroke="currentColor"
												strokeWidth="2"
												fill="none"
											/>
										</svg>
									</div>
								</div>
							)}

							{/* Terminal indicator */}
							{stage.enabled && isLast && idx < stages.length - 1 && (
								<div className="flex justify-center py-1">
									<span className="text-xs text-muted-foreground font-medium">
										pipeline stops here
									</span>
								</div>
							)}
						</div>
					);
				})}
			</div>

			{/* Summary + save */}
			<div className="flex items-center justify-between rounded-lg border p-4 bg-muted/50">
				<div className="text-sm text-muted-foreground">
					{enabledCount} stages enabled
					{approvalCount > 0 &&
						` \u00b7 ${approvalCount} approval checkpoint${approvalCount > 1 ? "s" : ""}`}
				</div>
				<button
					type="button"
					onClick={saveConfig}
					disabled={saving || saved}
					className={`rounded-lg px-6 py-2 font-bold ${
						saved
							? "bg-green-600 text-white"
							: "bg-primary text-primary-foreground hover:bg-primary/90"
					} disabled:opacity-70`}
				>
					{saved ? "Saved" : saving ? "Saving..." : "Save Pipeline"}
				</button>
			</div>

			{/* Presets */}
			<div className="mt-6">
				<p className="text-sm font-medium text-muted-foreground mb-3">
					Quick presets
				</p>
				<div className="flex gap-2 flex-wrap">
					{[
						{ label: "Spec only", enable: ["spec"] },
						{ label: "Spec + Code", enable: ["spec", "coding"] },
						{
							label: "Full (no docs)",
							enable: ["spec", "coding", "reviewing", "fixing", "merging"],
						},
						{
							label: "Full pipeline",
							enable: [
								"spec",
								"coding",
								"reviewing",
								"fixing",
								"documentation",
								"learning",
								"merging",
							],
						},
					].map((preset) => (
						<button
							key={preset.label}
							type="button"
							onClick={() => {
								setStages((prev) =>
									prev.map((s) => ({
										...s,
										enabled: preset.enable.includes(s.name),
										approvalRequired: false,
									})),
								);
								setSaved(false);
							}}
							className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
						>
							{preset.label}
						</button>
					))}
				</div>
			</div>
		</div>
	);
}
