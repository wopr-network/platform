"use client";

import { cn } from "@core/lib/utils";
import { Settings } from "lucide-react";
import Link from "next/link";

export interface PaperclipInstance {
	id: string;
	name: string;
	status: "running" | "stopped" | "error" | "provisioning";
	subdomain: string;
}

const statusConfig = {
	running: {
		label: "RUNNING",
		dot: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]",
		pulse: true,
		text: "text-emerald-400",
		border: "hover:border-emerald-500/30",
		glow: "hover:shadow-[0_0_30px_rgba(52,211,153,0.08)]",
	},
	provisioning: {
		label: "PROVISIONING",
		dot: "bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.6)]",
		pulse: true,
		text: "text-indigo-400",
		border: "border-indigo-500/20",
		glow: "shadow-[0_0_20px_rgba(129,140,248,0.05)]",
	},
	stopped: {
		label: "STOPPED",
		dot: "bg-zinc-500",
		pulse: false,
		text: "text-zinc-500",
		border: "hover:border-zinc-500/30",
		glow: "hover:shadow-[0_0_30px_rgba(161,161,170,0.05)]",
	},
	error: {
		label: "ERROR",
		dot: "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]",
		pulse: true,
		text: "text-red-400",
		border: "hover:border-red-500/30",
		glow: "hover:shadow-[0_0_30px_rgba(239,68,68,0.08)]",
	},
} as const;

export function PaperclipCard({
	instance,
	variant = "grid",
}: {
	instance: PaperclipInstance;
	variant?: "hero" | "grid";
}) {
	const s = statusConfig[instance.status];
	const isHero = variant === "hero";

	return (
		<div
			className={cn(
				"group relative rounded-lg border border-border/40 bg-card/80 backdrop-blur-sm transition-all duration-300",
				s.border,
				s.glow,
				isHero && "max-w-xl mx-auto",
				isHero ? "p-8" : "p-5",
				isHero && instance.status === "running" && "overflow-hidden",
			)}
		>
			{/* Animated top border for hero running state */}
			{isHero && instance.status === "running" && (
				<div
					className="absolute inset-x-0 top-0 h-px"
					style={{
						background:
							"linear-gradient(90deg, transparent, #818cf8, #a78bfa, transparent)",
						backgroundSize: "200% 100%",
						animation: "sweep 3s ease-in-out infinite",
					}}
				/>
			)}

			{/* Card surface — full card clickable (disabled during provisioning) */}
			{instance.status !== "provisioning" && (
				<>
					{/* biome-ignore lint/a11y/useKeyWithClickEvents: decorative click surface; keyboard users tab to the subdomain link below */}
					{/* biome-ignore lint/a11y/noStaticElementInteractions: same — purely visual click expander */}
					<span
						className="absolute inset-0 z-0 cursor-pointer"
						onClick={() =>
							window.open(
								`https://${instance.subdomain}`,
								"_blank",
								"noopener,noreferrer",
							)
						}
					/>
				</>
			)}

			{/* Status dot + name row */}
			<div className="relative z-10 flex items-center gap-3 mb-3">
				<span
					className={cn(
						"size-2.5 rounded-full flex-shrink-0",
						s.dot,
						s.pulse && "animate-pulse",
					)}
					aria-hidden="true"
				/>
				<h2
					className={cn(
						"font-semibold tracking-tight truncate",
						isHero ? "text-2xl" : "text-base",
					)}
				>
					{instance.name}
				</h2>
				<span
					className={cn(
						"text-[10px] font-medium tracking-[0.15em] uppercase flex-shrink-0",
						s.text,
					)}
				>
					{s.label}
				</span>
			</div>

			{/* Subdomain — the single focusable link for this destination */}
			<a
				href={`https://${instance.subdomain}`}
				target="_blank"
				rel="noopener noreferrer"
				aria-label={`Visit ${instance.name} at ${instance.subdomain}`}
				className={cn(
					"relative z-10 inline-block font-mono text-muted-foreground/70 group-hover:text-indigo-400/80 transition-colors duration-300",
					isHero ? "text-sm" : "text-xs",
				)}
			>
				{instance.subdomain}
			</a>

			{/* Settings gear */}
			<Link
				href={`/instances/${instance.id}`}
				className="absolute top-3 right-3 z-20 p-2 rounded-md text-muted-foreground/40 hover:text-indigo-400 hover:bg-indigo-400/10 transition-all duration-200"
				aria-label={`${instance.name} settings`}
				onClick={(e) => e.stopPropagation()}
			>
				<Settings
					className={cn(
						"transition-transform duration-200 group-hover:rotate-45",
						isHero ? "size-5" : "size-4",
					)}
				/>
			</Link>
		</div>
	);
}
