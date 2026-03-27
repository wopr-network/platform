"use client";

import { useState } from "react";
import type { AuditCategory } from "@/lib/types";

interface AuditFormProps {
	onSubmit: (categories: AuditCategory[], customInstructions?: string) => void;
	loading: boolean;
}

const categories: {
	id: AuditCategory;
	label: string;
	description: string;
	border: string;
	bg: string;
}[] = [
	{
		id: "code_quality",
		label: "Code Quality",
		description:
			"TODOs, dead code, large files, duplication, inconsistent patterns",
		border: "border-green-500",
		bg: "bg-green-500/10",
	},
	{
		id: "security",
		label: "Security",
		description: "Injection, path traversal, secrets, missing validation, eval",
		border: "border-red-500",
		bg: "bg-red-500/10",
	},
	{
		id: "test_coverage",
		label: "Test Coverage",
		description: "Untested modules, missing edge cases, flaky indicators",
		border: "border-sky-500",
		bg: "bg-sky-500/10",
	},
	{
		id: "ecosystem",
		label: "Ecosystem",
		description:
			"What similar projects are doing, platform updates to leverage",
		border: "border-amber-500",
		bg: "bg-amber-500/10",
	},
	{
		id: "tech_debt",
		label: "Tech Debt",
		description:
			"God objects, missing types, leaky abstractions, config sprawl",
		border: "border-zinc-500",
		bg: "bg-zinc-500/10",
	},
];

export function AuditForm({ onSubmit, loading }: AuditFormProps) {
	const [checked, setChecked] = useState<Set<AuditCategory>>(new Set());
	const [customChecked, setCustomChecked] = useState(false);
	const [customText, setCustomText] = useState("");

	function toggle(id: AuditCategory) {
		setChecked((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}

	function handleSubmit() {
		const cats = Array.from(checked);
		onSubmit(cats, customChecked ? customText : undefined);
	}

	const nothingSelected = checked.size === 0 && !customChecked;

	return (
		<div className="space-y-3">
			{categories.map((cat) => {
				const isChecked = checked.has(cat.id);
				return (
					<label
						key={cat.id}
						className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
							isChecked
								? `${cat.border} ${cat.bg}`
								: "border-border bg-card hover:border-muted-foreground/30"
						}`}
					>
						<input
							type="checkbox"
							className="sr-only"
							checked={isChecked}
							onChange={() => toggle(cat.id)}
						/>
						<div
							className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
								isChecked
									? `${cat.border} bg-current/20`
									: "border-muted-foreground/40"
							}`}
						>
							{isChecked && (
								<svg
									aria-hidden="true"
									className="h-3 w-3 text-foreground"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									strokeWidth={3}
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										d="M5 13l4 4L19 7"
									/>
								</svg>
							)}
						</div>
						<div>
							<span className="text-sm font-semibold text-card-foreground">
								{cat.label}
							</span>
							<p className="text-xs text-muted-foreground">{cat.description}</p>
						</div>
					</label>
				);
			})}

			{/* Custom Agent */}
			<label
				className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
					customChecked
						? "border-purple-500 bg-purple-500/10"
						: "border-border bg-card hover:border-muted-foreground/30"
				}`}
			>
				<input
					type="checkbox"
					className="sr-only"
					checked={customChecked}
					onChange={() => setCustomChecked((v) => !v)}
				/>
				<div
					className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
						customChecked ? "border-purple-500" : "border-muted-foreground/40"
					}`}
				>
					{customChecked && (
						<svg
							aria-hidden="true"
							className="h-3 w-3 text-foreground"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							strokeWidth={3}
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M5 13l4 4L19 7"
							/>
						</svg>
					)}
				</div>
				<div>
					<span className="text-sm font-semibold text-card-foreground">
						Custom Agent
					</span>
					<p className="text-xs text-muted-foreground">
						Your instructions — tell Holy Ship exactly what to look for
					</p>
				</div>
			</label>

			<div
				className="grid transition-all duration-200 ease-in-out"
				style={{
					gridTemplateRows: customChecked ? "1fr" : "0fr",
				}}
			>
				<div className="overflow-hidden">
					<textarea
						value={customText}
						onChange={(e) => setCustomText(e.target.value)}
						placeholder="e.g. Find all uses of deprecated API v1 endpoints..."
						rows={3}
						className="mt-1 w-full rounded-lg border border-purple-500/40 bg-card p-3 text-sm text-card-foreground placeholder:text-muted-foreground focus:border-purple-500 focus:outline-none"
					/>
				</div>
			</div>

			<button
				type="button"
				onClick={handleSubmit}
				disabled={nothingSelected || loading}
				className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
			>
				{loading ? "Generating..." : "Generate Stories"}
			</button>
		</div>
	);
}
