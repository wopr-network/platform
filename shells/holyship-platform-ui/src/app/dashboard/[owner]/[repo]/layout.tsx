"use client";

import Link from "next/link";
import { use } from "react";

import { RepoTabs } from "@/components/repo/repo-tabs";

export default function RepoLayout({
  params,
  children,
}: {
  // biome-ignore lint/suspicious/noExplicitAny: Next.js 16 generates Promise<unknown> for nested dynamic route params
  params: Promise<any>;
  children: React.ReactNode;
}) {
  const resolved = use(params) as { owner: string; repo: string };
  const owner = resolved.owner;
  const repo = resolved.repo;

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center gap-1.5 text-sm mb-4">
        <Link href="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors">
          Dashboard
        </Link>
        <span className="text-muted-foreground">&rsaquo;</span>
        <span className="text-foreground font-semibold">
          {owner}/{repo}
        </span>
      </div>

      <RepoTabs owner={owner} repo={repo} />

      <div className="mt-6">{children}</div>
    </div>
  );
}
