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
        <span className="text-orange-400 font-semibold">{sectionMatch[2]}</span>
        <span className="text-muted-foreground">:</span>
      </>
    );
  }
  return <span className="text-muted-foreground">{line}</span>;
}

function computeDiff(current: string, pending: string): { line: string; status: "added" | "removed" | "unchanged" }[] {
  const currentLines = current.split("\n");
  const pendingLines = pending.split("\n");
  const result: { line: string; status: "added" | "removed" | "unchanged" }[] = [];

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
      const insertIdx = result.findIndex((r) => r.status === "unchanged" && r.line.search(/\S/) === line.search(/\S/));
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
        // biome-ignore lint/suspicious/noArrayIndexKey: yaml line order is stable and positional
        <div key={i} className={`px-2 ${diffLineStyles[entry.status]}`}>
          {highlightYaml(entry.line)}
        </div>
      ))}
    </div>
  );
}
