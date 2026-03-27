"use client";

import { getBrandConfig } from "@core/lib/brand-config";
import { cn } from "@core/lib/utils";
import { Loader2, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const VALID_SUBDOMAIN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

export function toSubdomainLabel(input: string): string {
	return input
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 63);
}

export function AddPaperclipCard({
	onAdd,
	adding = false,
	variant = "card",
}: {
	onAdd: (name: string) => void;
	adding?: boolean;
	variant?: "card" | "link";
}) {
	const [expanded, setExpanded] = useState(false);
	const [name, setName] = useState("");
	const [error, setError] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (expanded) {
			inputRef.current?.focus();
		}
	}, [expanded]);

	function handleSubmit() {
		const label = toSubdomainLabel(name);
		if (!label) {
			setError("Name must contain at least one letter or number");
			return;
		}
		if (!VALID_SUBDOMAIN.test(label)) {
			setError("Invalid name for subdomain");
			return;
		}
		setError("");
		onAdd(label);
		setName("");
		setExpanded(false);
	}

	function expand() {
		setExpanded(true);
	}

	if (adding) {
		return (
			<div
				className={cn(
					"flex items-center justify-center gap-2 rounded-lg p-6 text-sm text-muted-foreground/60",
					variant === "card" &&
						"border border-dashed border-indigo-500/20 bg-indigo-500/[0.02]",
				)}
			>
				<Loader2 className="size-4 animate-spin text-indigo-400" />
				<span className="font-mono text-xs tracking-wide">Creating...</span>
			</div>
		);
	}

	if (!expanded) {
		return variant === "link" ? (
			<button
				type="button"
				onClick={expand}
				className="font-mono text-xs text-muted-foreground/50 hover:text-indigo-400 tracking-wide transition-colors duration-200"
			>
				Add another Paperclip
			</button>
		) : (
			<button
				type="button"
				onClick={expand}
				className="group/add flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/30 p-6 text-muted-foreground/40 hover:border-indigo-500/30 hover:text-indigo-400 hover:bg-indigo-500/[0.02] transition-all duration-300 cursor-pointer min-h-[120px]"
			>
				<Plus className="size-6 transition-transform duration-300 group-hover/add:rotate-90" />
				<span className="font-mono text-xs tracking-wide">
					Add another Paperclip
				</span>
			</button>
		);
	}

	return (
		<div
			className={cn(
				"rounded-lg p-6",
				variant === "card" &&
					"border border-dashed border-indigo-500/20 bg-indigo-500/[0.02]",
			)}
		>
			<input
				ref={inputRef}
				type="text"
				placeholder="Name your Paperclip"
				aria-label="Paperclip name"
				value={name}
				onChange={(e) => {
					setName(e.target.value);
					setError("");
				}}
				onKeyDown={(e) => {
					if (e.key === "Enter") handleSubmit();
					if (e.key === "Escape") {
						setExpanded(false);
						setName("");
						setError("");
					}
				}}
				className="w-full bg-transparent border-b border-border/30 pb-2 font-mono text-sm outline-none focus:border-indigo-400/60 transition-colors duration-200 placeholder:text-muted-foreground/30"
			/>
			{error && (
				<p className="mt-1 font-mono text-[10px] text-red-400/80">{error}</p>
			)}
			{name && !error && (
				<p className="mt-1 font-mono text-[10px] text-muted-foreground/30">
					{toSubdomainLabel(name)}.{getBrandConfig().domain}
				</p>
			)}
			<p className="mt-1 font-mono text-[10px] text-muted-foreground/40 tracking-wide">
				ENTER to create · ESC to cancel
			</p>
		</div>
	);
}
