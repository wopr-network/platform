# Visual Flow Editor Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a conversational flow editor to the Analyze tab — users see the flow as a diagram or YAML, talk to it to make changes, and apply changes as a PR.

**Architecture:** The flow lives in `.holyship/flow.yml` in the customer's repo. The UI reads it via `GET /flow`, sends edit requests to `POST /flow/edit` (single LLM call), and applies changes via `POST /flow/apply` (creates a PR). All state is local — no conversation persistence.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind v4, TypeScript, existing holyship API client pattern.

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/lib/types.ts` | Add `FlowResponse`, `FlowEditResponse`, `FlowApplyResponse`, `FlowChatMessage` types |
| Modify | `src/lib/holyship-client.ts` | Add `getFlow`, `editFlow`, `applyFlow` methods |
| Create | `src/components/repo/flow-editor.tsx` | Container: state management, coordinates sub-components |
| Create | `src/components/repo/flow-view-tabs.tsx` | Visual/Text tab switcher |
| Modify | `src/components/repo/flow-diagram.tsx` | Add optional `pendingFlow` prop for diff highlighting |
| Create | `src/components/repo/flow-yaml-view.tsx` | Syntax-highlighted YAML with diff view |
| Create | `src/components/repo/flow-chat.tsx` | Conversation UI: input + message history |
| Create | `src/components/repo/flow-action-bar.tsx` | Pending changes: discard / apply → PR |
| Modify | `src/app/dashboard/[owner]/[repo]/analyze/page.tsx` | Replace flow section with `<FlowEditor>` |

---

## Chunk 1: Types and API Client

### Task 1: Add flow editor types

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add the new types to types.ts**

Add these types after the existing `DesignedFlow` interface (after line 112):

```typescript
export interface FlowResponse {
	yaml: string;
	flow: DesignedFlow;
	sha: string;
}

export interface FlowEditResponse {
	updatedYaml: string;
	updatedFlow: DesignedFlow;
	explanation: string;
	diff: string[];
}

export interface FlowApplyResponse {
	prUrl: string;
	prNumber: number;
	branch: string;
}

export interface FlowChatMessage {
	role: "user" | "ai";
	text: string;
	changes?: string[];
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd ~/holyship-platform-ui && npx tsc --noEmit 2>&1 | tail -5`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add flow editor types"
```

---

### Task 2: Add API client methods

**Files:**
- Modify: `src/lib/holyship-client.ts`

- [ ] **Step 1: Add the three flow methods**

Add after the existing `designFlow` function (after line 113). Follow the exact patterns used by the existing functions — `request<T>()` helper, same style:

```typescript
// ─── Flow Editor ───

export async function getFlow(owner: string, repo: string) {
	try {
		return await request<FlowResponse>(`/repos/${owner}/${repo}/flow`);
	} catch {
		return null;
	}
}

export function editFlow(
	owner: string,
	repo: string,
	message: string,
	currentYaml: string,
) {
	return request<FlowEditResponse>(`/repos/${owner}/${repo}/flow/edit`, {
		method: "POST",
		body: JSON.stringify({ message, currentYaml }),
		signal: AbortSignal.timeout(60_000),
	});
}

export function applyFlow(
	owner: string,
	repo: string,
	yaml: string,
	commitMessage: string,
	baseSha: string,
) {
	return request<FlowApplyResponse>(`/repos/${owner}/${repo}/flow/apply`, {
		method: "POST",
		body: JSON.stringify({ yaml, commitMessage, baseSha }),
	});
}
```

Also add the new types to the import at the top of the file:

```typescript
import type {
	AuditCategory,
	AuditResult,
	CreatedIssue,
	DesignedFlow,
	FlowApplyResponse,
	FlowEditResponse,
	FlowResponse,
	Gap,
	RepoConfig,
} from "./types";
```

- [ ] **Step 2: Verify it compiles**

Run: `cd ~/holyship-platform-ui && npx tsc --noEmit 2>&1 | tail -5`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/holyship-client.ts
git commit -m "feat: add flow editor API client methods"
```

---

## Chunk 2: Flow Diagram Enhancement

### Task 3: Add pendingFlow diff highlighting to FlowDiagram

**Files:**
- Modify: `src/components/repo/flow-diagram.tsx`

- [ ] **Step 1: Update the interface and add diff logic**

Update `FlowDiagramProps` to accept an optional `pendingFlow`:

```typescript
interface FlowDiagramProps {
	flow: DesignedFlow;
	pendingFlow?: DesignedFlow;
}
```

Add a helper function after the existing `stateStyle` function to compute diff status:

```typescript
type DiffStatus = "added" | "modified" | "removed" | "unchanged";

function diffState(
	name: string,
	current: DesignedFlow,
	pending?: DesignedFlow,
): DiffStatus {
	if (!pending) return "unchanged";
	const inCurrent = current.states.some((s) => s.name === name);
	const inPending = pending.states.some((s) => s.name === name);
	if (!inCurrent && inPending) return "added";
	if (inCurrent && !inPending) return "removed";
	if (inCurrent && inPending) {
		const cs = current.states.find((s) => s.name === name);
		const ps = pending.states.find((s) => s.name === name);
		if (
			cs?.agentRole !== ps?.agentRole ||
			cs?.modelTier !== ps?.modelTier ||
			cs?.mode !== ps?.mode
		)
			return "modified";
	}
	return "unchanged";
}

const diffStyles: Record<DiffStatus, string> = {
	added: "ring-2 ring-green-400 animate-pulse",
	modified: "ring-2 ring-amber-400",
	removed: "opacity-40 line-through",
	unchanged: "",
};
```

- [ ] **Step 2: Update StatePill to accept diff styling**

```typescript
function StatePill({
	name,
	diff = "unchanged",
}: { name: string; diff?: DiffStatus }) {
	return (
		<span
			className={`inline-block rounded-full px-4 py-1.5 text-sm font-semibold ${stateStyle(name)} ${diffStyles[diff]}`}
		>
			{name}
		</span>
	);
}
```

- [ ] **Step 3: Update the FlowDiagram component to use diff**

Update the export function signature and pass diff status through:

```typescript
export function FlowDiagram({ flow, pendingFlow }: FlowDiagramProps) {
	const displayFlow = pendingFlow ?? flow;
	const { path, hasReviewFixLoop } = buildMainPath(displayFlow);
	const terminalStates = displayFlow.states
		.filter((s) => TERMINAL.has(s.name))
		.map((s) => s.name);
```

Then in the `path.map()`, change `<StatePill name={state} />` to:

```typescript
<StatePill name={state} diff={diffState(state, flow, pendingFlow)} />
```

And update the `ReviewFixLoop` usage similarly — pass `diff` to StatePills inside it. Update `ReviewFixLoop` to accept a `pendingFlow` prop and pass diff status to its internal `StatePill` calls:

```typescript
function ReviewFixLoop({
	transitions,
	gateWiring,
	flow,
	pendingFlow,
}: {
	transitions: DesignedFlowTransition[];
	gateWiring: DesignedFlow["gateWiring"];
	flow: DesignedFlow;
	pendingFlow?: DesignedFlow;
}) {
```

And use `<StatePill name="review" diff={diffState("review", flow, pendingFlow)} />` and `<StatePill name="fix" diff={diffState("fix", flow, pendingFlow)} />` inside it.

In the terminal states section, similarly:

```typescript
{terminalStates.map((s) => (
	<StatePill key={s} name={s} diff={diffState(s, flow, pendingFlow)} />
))}
```

- [ ] **Step 4: Verify it compiles and existing usage still works**

Run: `cd ~/holyship-platform-ui && npx tsc --noEmit 2>&1 | tail -5`
Expected: No new errors (pendingFlow is optional, so existing usage `<FlowDiagram flow={flow} />` still works)

- [ ] **Step 5: Commit**

```bash
git add src/components/repo/flow-diagram.tsx
git commit -m "feat: add pendingFlow diff highlighting to FlowDiagram"
```

---

## Chunk 3: New Components — YAML View, Chat, Action Bar, Tabs

### Task 4: Create flow-yaml-view.tsx

**Files:**
- Create: `src/components/repo/flow-yaml-view.tsx`

- [ ] **Step 1: Create the component**

This displays syntax-highlighted YAML. When `pendingYaml` is provided, shows a line-by-line diff. Follow existing codebase patterns: `"use client"`, tabs for indentation, Tailwind classes.

```typescript
"use client";

interface FlowYamlViewProps {
	yaml: string;
	pendingYaml?: string;
}

function highlightYaml(line: string): React.ReactNode {
	// Key: value pattern
	const keyMatch = line.match(/^(\s*-?\s*)(\w[\w.]*)(:\s*)(.*)/);
	if (keyMatch) {
		const [, indent, key, colon, value] = keyMatch;
		return (
			<>
				<span className="text-muted-foreground">{indent}</span>
				<span className="text-sky-400">{key}</span>
				<span className="text-muted-foreground">{colon}</span>
				<span className="text-foreground">{value}</span>
			</>
		);
	}
	// Comment
	if (line.trimStart().startsWith("#")) {
		return <span className="text-muted-foreground italic">{line}</span>;
	}
	// Section header (no colon value)
	const sectionMatch = line.match(/^(\s*)(\w+):$/);
	if (sectionMatch) {
		return (
			<>
				<span className="text-muted-foreground">{sectionMatch[1]}</span>
				<span className="text-orange-400 font-semibold">
					{sectionMatch[2]}
				</span>
				<span className="text-muted-foreground">:</span>
			</>
		);
	}
	return <span className="text-muted-foreground">{line}</span>;
}

function computeDiff(
	current: string,
	pending: string,
): { line: string; status: "added" | "removed" | "unchanged" }[] {
	const currentLines = current.split("\n");
	const pendingLines = pending.split("\n");
	const result: { line: string; status: "added" | "removed" | "unchanged" }[] =
		[];

	const currentSet = new Set(currentLines.map((l) => l.trim()));
	const pendingSet = new Set(pendingLines.map((l) => l.trim()));

	for (const line of pendingLines) {
		if (!currentSet.has(line.trim()) && line.trim() !== "") {
			result.push({ line, status: "added" });
		} else {
			result.push({ line, status: "unchanged" });
		}
	}

	// Show removed lines that aren't in pending
	for (const line of currentLines) {
		if (!pendingSet.has(line.trim()) && line.trim() !== "") {
			// Find insertion point (after last unchanged line with similar indent)
			const insertIdx = result.findIndex(
				(r) =>
					r.status === "unchanged" &&
					r.line.search(/\S/) === line.search(/\S/),
			);
			if (insertIdx >= 0) {
				result.splice(insertIdx + 1, 0, { line, status: "removed" });
			}
		}
	}

	return result;
}

const diffLineStyles = {
	added: "bg-green-500/10 border-l-2 border-green-400",
	removed: "bg-red-500/10 border-l-2 border-red-400 line-through opacity-60",
	unchanged: "",
};

export function FlowYamlView({ yaml, pendingYaml }: FlowYamlViewProps) {
	const displayYaml = pendingYaml ?? yaml;
	const lines = pendingYaml
		? computeDiff(yaml, pendingYaml)
		: displayYaml.split("\n").map((line) => ({ line, status: "unchanged" as const }));

	return (
		<div className="rounded-lg bg-black/30 p-4 font-mono text-xs leading-relaxed overflow-x-auto">
			{lines.map((entry, i) => (
				<div
					key={`${i}-${entry.line.slice(0, 20)}`}
					className={`px-2 ${diffLineStyles[entry.status]}`}
				>
					{highlightYaml(entry.line)}
				</div>
			))}
		</div>
	);
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd ~/holyship-platform-ui && npx tsc --noEmit 2>&1 | tail -5`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add src/components/repo/flow-yaml-view.tsx
git commit -m "feat: add FlowYamlView component with diff highlighting"
```

---

### Task 5: Create flow-chat.tsx

**Files:**
- Create: `src/components/repo/flow-chat.tsx`

- [ ] **Step 1: Create the component**

Conversation interface with input, send button, and message history. Follows the mockup: user messages on the right-ish, AI responses with diff blocks.

```typescript
"use client";

import { useRef, useState } from "react";
import type { FlowChatMessage } from "@/lib/types";

interface FlowChatProps {
	messages: FlowChatMessage[];
	onSend: (message: string) => void;
	sending: boolean;
}

function UserBubble({ text }: { text: string }) {
	return (
		<div className="flex gap-2 items-start">
			<div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-500/15 text-xs text-orange-400">
				Y
			</div>
			<div className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-foreground">
				{text}
			</div>
		</div>
	);
}

function AiBubble({ text, changes }: { text: string; changes?: string[] }) {
	return (
		<div className="flex gap-2 items-start">
			<div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-500/15 text-xs text-green-400">
				&#x2731;
			</div>
			<div className="space-y-2">
				<div className="rounded-lg border border-green-500/10 bg-green-500/5 px-3 py-2 text-sm text-foreground">
					{text}
				</div>
				{changes && changes.length > 0 && (
					<div className="rounded-lg bg-black/30 px-3 py-2 font-mono text-xs leading-relaxed">
						{changes.map((change, i) => {
							const color = change.startsWith("+")
								? "text-green-400"
								: change.startsWith("~")
									? "text-amber-400"
									: change.startsWith("-")
										? "text-red-400"
										: "text-muted-foreground";
							return (
								<div key={`${i}-${change.slice(0, 20)}`} className={color}>
									{change}
								</div>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
}

export function FlowChat({ messages, onSend, sending }: FlowChatProps) {
	const [input, setInput] = useState("");
	const inputRef = useRef<HTMLTextAreaElement>(null);

	function handleSubmit() {
		const trimmed = input.trim();
		if (!trimmed || sending) return;
		onSend(trimmed);
		setInput("");
	}

	function handleKeyDown(e: React.KeyboardEvent) {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSubmit();
		}
	}

	return (
		<div className="space-y-3">
			{messages.length > 0 && (
				<div className="space-y-3 max-h-80 overflow-y-auto">
					{messages.map((msg, i) =>
						msg.role === "user" ? (
							<UserBubble key={`${i}-${msg.role}`} text={msg.text} />
						) : (
							<AiBubble
								key={`${i}-${msg.role}`}
								text={msg.text}
								changes={msg.changes}
							/>
						),
					)}
				</div>
			)}

			<div className="flex gap-2 items-end">
				<textarea
					ref={inputRef}
					value={input}
					onChange={(e) => setInput(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder="Talk about changes..."
					rows={1}
					disabled={sending}
					className="flex-1 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none resize-none disabled:opacity-50"
				/>
				<button
					type="button"
					onClick={handleSubmit}
					disabled={!input.trim() || sending}
					className="shrink-0 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
				>
					{sending ? "Thinking..." : "Update"}
				</button>
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd ~/holyship-platform-ui && npx tsc --noEmit 2>&1 | tail -5`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add src/components/repo/flow-chat.tsx
git commit -m "feat: add FlowChat conversation component"
```

---

### Task 6: Create flow-action-bar.tsx

**Files:**
- Create: `src/components/repo/flow-action-bar.tsx`

- [ ] **Step 1: Create the component**

Shows when changes are pending. Discard button, Apply → PR button, and post-apply PR link.

```typescript
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
```

- [ ] **Step 2: Verify it compiles**

Run: `cd ~/holyship-platform-ui && npx tsc --noEmit 2>&1 | tail -5`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add src/components/repo/flow-action-bar.tsx
git commit -m "feat: add FlowActionBar component"
```

---

### Task 7: Create flow-view-tabs.tsx

**Files:**
- Create: `src/components/repo/flow-view-tabs.tsx`

- [ ] **Step 1: Create the component**

Simple Visual/Text tab switcher. Follows the repo-tabs.tsx pattern but simpler.

```typescript
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
```

- [ ] **Step 2: Verify it compiles**

Run: `cd ~/holyship-platform-ui && npx tsc --noEmit 2>&1 | tail -5`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add src/components/repo/flow-view-tabs.tsx
git commit -m "feat: add FlowViewTabs component"
```

---

## Chunk 4: Flow Editor Container and Page Integration

### Task 8: Create flow-editor.tsx

**Files:**
- Create: `src/components/repo/flow-editor.tsx`

- [ ] **Step 1: Create the container component**

This is the main orchestrator. It manages all state from the spec, coordinates the sub-components, and handles the API calls.

```typescript
"use client";

import { useCallback, useEffect, useState } from "react";
import { FlowActionBar } from "@/components/repo/flow-action-bar";
import { FlowChat } from "@/components/repo/flow-chat";
import { FlowDiagram } from "@/components/repo/flow-diagram";
import { FlowViewTabs } from "@/components/repo/flow-view-tabs";
import { FlowYamlView } from "@/components/repo/flow-yaml-view";
import { applyFlow, editFlow, getFlow } from "@/lib/holyship-client";
import type { DesignedFlow, FlowChatMessage, RepoConfig } from "@/lib/types";

interface FlowEditorProps {
	owner: string;
	repo: string;
	config: RepoConfig;
}

export function FlowEditor({ owner, repo, config }: FlowEditorProps) {
	// Current state from repo
	const [currentYaml, setCurrentYaml] = useState<string | null>(null);
	const [currentFlow, setCurrentFlow] = useState<DesignedFlow | null>(null);
	const [currentSha, setCurrentSha] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [noFlow, setNoFlow] = useState(false);

	// Pending state from edits
	const [pendingYaml, setPendingYaml] = useState<string | null>(null);
	const [pendingFlow, setPendingFlow] = useState<DesignedFlow | null>(null);

	// Chat
	const [messages, setMessages] = useState<FlowChatMessage[]>([]);
	const [sending, setSending] = useState(false);

	// Apply
	const [applying, setApplying] = useState(false);
	const [appliedPr, setAppliedPr] = useState<{
		url: string;
		number: number;
	} | null>(null);

	// View
	const [activeTab, setActiveTab] = useState<"visual" | "text">("visual");

	const loadFlow = useCallback(async () => {
		setLoading(true);
		try {
			const result = await getFlow(owner, repo);
			if (result) {
				setCurrentYaml(result.yaml);
				setCurrentFlow(result.flow);
				setCurrentSha(result.sha);
				setNoFlow(false);
			} else {
				setCurrentYaml(null);
				setCurrentFlow(null);
				setCurrentSha(null);
				setNoFlow(true);
			}
		} catch {
			setNoFlow(true);
		} finally {
			setLoading(false);
		}
	}, [owner, repo]);

	useEffect(() => {
		loadFlow();
	}, [loadFlow]);

	async function handleSend(message: string) {
		setSending(true);
		setMessages((prev) => [...prev, { role: "user", text: message }]);
		try {
			const yamlToSend = pendingYaml ?? currentYaml ?? "";
			const result = await editFlow(owner, repo, message, yamlToSend);
			setPendingYaml(result.updatedYaml);
			setPendingFlow(result.updatedFlow);
			setMessages((prev) => [
				...prev,
				{
					role: "ai",
					text: result.explanation,
					changes: result.diff,
				},
			]);
		} catch (err) {
			const errorMsg =
				err instanceof Error ? err.message : "Something went wrong";
			const isParseError = errorMsg.includes("422");
			setMessages((prev) => [
				...prev,
				{
					role: "ai",
					text: isParseError
						? "Couldn't understand the response \u2014 try rephrasing."
						: `Error: ${errorMsg}`,
				},
			]);
		} finally {
			setSending(false);
		}
	}

	async function handleApply() {
		if (!pendingYaml) return;
		setApplying(true);
		try {
			const result = await applyFlow(
				owner,
				repo,
				pendingYaml,
				`Update .holyship/flow.yml via visual editor`,
				currentSha ?? "",
			);
			setAppliedPr({ url: result.prUrl, number: result.prNumber });
		} catch (err) {
			const errorMsg =
				err instanceof Error ? err.message : "Failed to create PR";
			setMessages((prev) => [
				...prev,
				{ role: "ai", text: `Failed to apply: ${errorMsg}` },
			]);
		} finally {
			setApplying(false);
		}
	}

	function handleDiscard() {
		setPendingYaml(null);
		setPendingFlow(null);
		setAppliedPr(null);
	}

	// Diff count: number of lines in the diff
	const changeCount = pendingYaml
		? messages.reduce((count, m) => count + (m.changes?.length ?? 0), 0)
		: 0;

	if (loading) {
		return (
			<div className="flex items-center justify-center py-8">
				<div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
			</div>
		);
	}

	const displayFlow = pendingFlow ?? currentFlow;
	const displayYaml = pendingYaml ?? currentYaml;

	return (
		<div className="space-y-3">
			<h3 className="text-sm font-semibold">Flow</h3>

			{noFlow && !pendingFlow ? (
				<p className="text-sm text-muted-foreground">
					No flow configured. Describe what you want below, or run analysis
					to generate one.
				</p>
			) : (
				<>
					<FlowViewTabs
						activeTab={activeTab}
						onTabChange={setActiveTab}
						pendingChangeCount={changeCount > 0 ? changeCount : undefined}
					/>

					{activeTab === "visual" && displayFlow && (
						<FlowDiagram
							flow={currentFlow ?? displayFlow}
							pendingFlow={pendingFlow ?? undefined}
						/>
					)}

					{activeTab === "text" && displayYaml && (
						<FlowYamlView
							yaml={currentYaml ?? ""}
							pendingYaml={pendingYaml ?? undefined}
						/>
					)}
				</>
			)}

			<FlowChat messages={messages} onSend={handleSend} sending={sending} />

			{pendingYaml && (
				<FlowActionBar
					changeCount={changeCount}
					onDiscard={handleDiscard}
					onApply={handleApply}
					applying={applying}
					appliedPr={appliedPr}
				/>
			)}
		</div>
	);
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd ~/holyship-platform-ui && npx tsc --noEmit 2>&1 | tail -5`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add src/components/repo/flow-editor.tsx
git commit -m "feat: add FlowEditor container component"
```

---

### Task 9: Integrate FlowEditor into the Analyze page

**Files:**
- Modify: `src/app/dashboard/[owner]/[repo]/analyze/page.tsx`

- [ ] **Step 1: Replace the flow section**

Replace the entire flow section (lines 121-143 of the current file) with the FlowEditor component. The FlowEditor manages its own flow data, so remove the `flow` state and `handleDesignFlow` function from the page.

Changes:
1. Remove `useState<DesignedFlow | null>(null)` for flow (line 26)
2. Remove `useState(false)` for designingFlow (line 29)
3. Remove the `handleDesignFlow` function (lines 65-73)
4. Remove `designFlow` from the import
5. Add `FlowEditor` import
6. Replace lines 121-143 with:

```tsx
<FlowEditor owner={owner} repo={repo} config={config} />
```

The full updated import section should be:

```typescript
import { ConfigGrid } from "@/components/repo/config-grid";
import { FlowEditor } from "@/components/repo/flow-editor";
import { GapChecklist } from "@/components/repo/gap-checklist";
import {
	getRepoConfig,
	getRepoGaps,
	interrogateRepo,
} from "@/lib/holyship-client";
import type { Gap, RepoConfig } from "@/lib/types";
```

The full "Analyzed state" return should become:

```tsx
return (
	<div className="space-y-6">
		<ConfigGrid config={config} />

		<GapChecklist
			gaps={gaps}
			owner={owner}
			repo={repo}
			onUpdate={loadConfig}
		/>

		<FlowEditor owner={owner} repo={repo} config={config} />

		<button
			type="button"
			onClick={handleAnalyze}
			disabled={analyzing}
			className="rounded-lg border border-border px-6 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 disabled:opacity-50"
		>
			{analyzing ? "Re-analyzing..." : "Re-analyze"}
		</button>
	</div>
);
```

- [ ] **Step 2: Verify it compiles**

Run: `cd ~/holyship-platform-ui && npx tsc --noEmit 2>&1 | tail -5`
Expected: No new errors

- [ ] **Step 3: Run biome check**

Run: `cd ~/holyship-platform-ui && npx biome check src/app/dashboard/\[owner\]/\[repo\]/analyze/page.tsx src/components/repo/flow-editor.tsx src/components/repo/flow-chat.tsx src/components/repo/flow-yaml-view.tsx src/components/repo/flow-action-bar.tsx src/components/repo/flow-view-tabs.tsx src/components/repo/flow-diagram.tsx src/lib/types.ts src/lib/holyship-client.ts 2>&1 | tail -20`
Expected: No errors. If there are import ordering or other lint issues, fix them.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/\[owner\]/\[repo\]/analyze/page.tsx
git commit -m "feat: integrate FlowEditor into Analyze page"
```

- [ ] **Step 5: Final build check**

Run: `cd ~/holyship-platform-ui && npx biome check --write src/ && npx tsc --noEmit 2>&1 | tail -10`
Expected: All clean
