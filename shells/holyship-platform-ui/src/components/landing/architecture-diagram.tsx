"use client";

type TreeNode = {
  label: string;
  annotation?: string;
  children?: TreeNode[];
};

type Props = {
  title: string;
  variant: "dim" | "orange";
  tree: TreeNode[];
};

function TreeItem({ node, variant, depth = 0 }: { node: TreeNode; variant: "dim" | "orange"; depth?: number }) {
  const textColor = variant === "dim" ? "text-off-white/30" : "text-off-white/90";
  const annotationColor = variant === "dim" ? "text-off-white/15" : "text-signal-orange/60";
  const lineColor = variant === "dim" ? "border-off-white/10" : "border-signal-orange/30";

  return (
    <div className={depth > 0 ? `ml-6 pl-4 border-l ${lineColor}` : ""}>
      <div className="py-1.5">
        <span className={`text-base md:text-lg font-mono ${textColor}`}>{node.label}</span>
        {node.annotation && <span className={`text-sm ml-2 ${annotationColor}`}>({node.annotation})</span>}
      </div>
      {node.children?.map((child) => (
        <TreeItem key={child.label} node={child} variant={variant} depth={depth + 1} />
      ))}
    </div>
  );
}

export function ArchitectureDiagram({ title, variant, tree }: Props) {
  const titleColor = variant === "dim" ? "text-off-white/30" : "text-signal-orange";

  return (
    <div className="py-8">
      <h3 className={`text-lg font-bold ${titleColor} mb-6 font-mono uppercase tracking-wider`}>{title}</h3>
      <div className="space-y-1">
        {tree.map((node) => (
          <TreeItem key={node.label} node={node} variant={variant} />
        ))}
      </div>
    </div>
  );
}
