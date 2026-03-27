"use client";

import type { RepoConfig } from "@/lib/types";

interface ConfigGridProps {
  config: RepoConfig;
}

interface CardData {
  label: string;
  value: string;
  ok: boolean;
}

function buildCards(config: RepoConfig): CardData[] {
  return [
    {
      label: "Languages",
      value: config.languages.join(", ") || "Unknown",
      ok: config.languages.length > 0,
    },
    {
      label: "CI",
      value: config.ci.provider ? `${config.ci.provider}` : "None",
      ok: config.ci.supported,
    },
    {
      label: "Testing",
      value: config.testing.framework
        ? config.testing.coverageThreshold
          ? `${config.testing.framework} (${config.testing.coverageThreshold}%)`
          : config.testing.framework
        : "None",
      ok: config.testing.supported,
    },
    {
      label: "Linter",
      value: config.linting.tool ?? "None",
      ok: config.linting.supported,
    },
    {
      label: "Docs",
      value: config.docs.location ?? "None",
      ok: config.docs.supported,
    },
    {
      label: "Merge Queue",
      value: config.ci.hasMergeQueue ? "Enabled" : "Disabled",
      ok: !!config.ci.hasMergeQueue,
    },
  ];
}

function StatusIcon({ ok }: { ok: boolean }) {
  if (ok) {
    return <span className="text-green-400">&#10003;</span>;
  }
  return <span className="text-red-400">&#10007;</span>;
}

export function ConfigGrid({ config }: ConfigGridProps) {
  const cards = buildCards(config);

  return (
    <div className="grid grid-cols-3 gap-3">
      {cards.map((card) => (
        <div key={card.label} className="bg-muted/50 rounded-lg p-3">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">{card.label}</p>
          <p className={`mt-1 text-sm font-medium ${card.ok ? "text-green-400" : "text-destructive"}`}>
            {card.value} <StatusIcon ok={card.ok} />
          </p>
        </div>
      ))}
    </div>
  );
}
