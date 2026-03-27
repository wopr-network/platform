"use client";

import { cn } from "@core/lib/utils";
import { Plus } from "lucide-react";

export interface TabInstance {
	id: string;
	name: string;
	status: "running" | "stopped" | "error";
}

const statusDot = {
	running: "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]",
	stopped: "bg-zinc-500",
	error: "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]",
} as const;

export function ChatTabBar({
	instances,
	activeId,
	onSelect,
	onAdd,
}: {
	instances: TabInstance[];
	activeId: string;
	onSelect: (id: string) => void;
	onAdd: () => void;
}) {
	return (
		<div className="flex items-center gap-1 border-b border-border/30 px-2 overflow-x-auto">
			{instances.map((inst) => (
				<button
					key={inst.id}
					type="button"
					onClick={() => onSelect(inst.id)}
					className={cn(
						"flex items-center gap-2 px-4 py-2.5 text-sm font-mono whitespace-nowrap transition-colors border-b-2",
						inst.id === activeId
							? "border-indigo-400 text-foreground"
							: "border-transparent text-muted-foreground/60 hover:text-muted-foreground hover:border-border/50",
					)}
				>
					<span
						className={cn(
							"size-2 rounded-full flex-shrink-0",
							statusDot[inst.status],
						)}
					/>
					{inst.name}
				</button>
			))}
			<button
				type="button"
				onClick={onAdd}
				aria-label="Add agent"
				className="flex items-center justify-center size-8 ml-1 rounded text-muted-foreground/40 hover:text-indigo-400 hover:bg-indigo-400/10 transition-colors"
			>
				<Plus className="size-4" />
			</button>
		</div>
	);
}
