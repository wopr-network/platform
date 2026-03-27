"use client";

interface FlowViewTabsProps {
	activeTab: "visual" | "text";
	onTabChange: (tab: "visual" | "text") => void;
	pendingChangeCount?: number;
}

export function FlowViewTabs({
	activeTab,
	onTabChange,
	pendingChangeCount,
}: FlowViewTabsProps) {
	const tabs = [
		{ id: "visual" as const, label: "Visual" },
		{ id: "text" as const, label: "Text" },
	];

	return (
		<div className="flex items-center gap-0 border-b border-border">
			{tabs.map((tab) => (
				<button
					key={tab.id}
					type="button"
					onClick={() => onTabChange(tab.id)}
					className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
						activeTab === tab.id
							? "text-orange-400 border-orange-400"
							: "text-muted-foreground border-transparent hover:text-foreground"
					}`}
				>
					{tab.label}
				</button>
			))}
			<div className="flex-1" />
			{pendingChangeCount != null && pendingChangeCount > 0 && (
				<span className="mr-2 rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-semibold text-orange-400">
					{pendingChangeCount} changes
				</span>
			)}
		</div>
	);
}
