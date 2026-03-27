"use client";

import { getBrandConfig } from "@core/lib/brand-config";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const VALID_SUBDOMAIN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

function sanitize(input: string): string {
	return input
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 63);
}

export function FirstRun({
	onClaim,
	claiming,
}: {
	onClaim: (name: string) => void;
	claiming: boolean;
}) {
	const [name, setName] = useState("");
	const [error, setError] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);
	const brand = getBrandConfig();
	const label = sanitize(name);

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	function handleSubmit() {
		if (!label) {
			setError("Name must contain at least one letter or number");
			return;
		}
		if (!VALID_SUBDOMAIN.test(label)) {
			setError("Invalid name for subdomain");
			return;
		}
		setError("");
		onClaim(label);
	}

	if (claiming) {
		return (
			<div className="flex flex-col items-center justify-center h-full gap-4">
				<Loader2 className="size-8 animate-spin text-indigo-400" />
				<p className="font-mono text-sm text-muted-foreground/60">
					Creating your agent...
				</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col items-center justify-center h-full gap-6">
			<div className="text-center">
				<h1 className="text-3xl font-bold tracking-tight">
					Name your first agent
				</h1>
				<p className="font-mono text-xs text-muted-foreground/50 mt-2">
					This becomes your subdomain
				</p>
			</div>
			<div className="w-full max-w-md">
				<input
					ref={inputRef}
					type="text"
					placeholder="Name your first agent"
					value={name}
					onChange={(e) => {
						setName(e.target.value);
						setError("");
					}}
					onKeyDown={(e) => {
						if (e.key === "Enter") handleSubmit();
					}}
					className="w-full bg-transparent border-b-2 border-border/30 pb-3 text-center text-xl font-mono outline-none focus:border-indigo-400/60 transition-colors placeholder:text-muted-foreground/30"
				/>
				{error && (
					<p className="mt-2 text-center font-mono text-xs text-red-400/80">
						{error}
					</p>
				)}
				{label && !error && (
					<p className="mt-2 text-center font-mono text-xs text-indigo-400/40">
						{label}.{brand.domain}
					</p>
				)}
				<p className="mt-4 text-center font-mono text-[10px] text-muted-foreground/30 tracking-wide">
					PRESS ENTER TO CREATE
				</p>
			</div>
		</div>
	);
}
