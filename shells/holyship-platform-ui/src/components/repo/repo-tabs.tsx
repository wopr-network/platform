"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface RepoTabsProps {
  owner: string;
  repo: string;
}

const tabs = [
  { label: "Issues", path: "" },
  { label: "Analyze", path: "/analyze" },
  { label: "Stories", path: "/stories" },
  { label: "Pipeline", path: "/pipeline" },
];

export function RepoTabs({ owner, repo }: RepoTabsProps) {
  const pathname = usePathname();
  const base = `/dashboard/${owner}/${repo}`;

  return (
    <div className="flex border-b border-border">
      {tabs.map((tab) => {
        const href = `${base}${tab.path}`;
        const active = tab.path === "" ? pathname === base : pathname === href;

        return (
          <Link
            key={tab.label}
            href={href}
            className={`px-4 py-2 text-sm transition-colors ${
              active
                ? "text-primary font-semibold border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
