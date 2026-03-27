import { NextResponse } from "next/server";

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
}

interface GitHubInstallationReposResponse {
  total_count: number;
  repositories: GitHubRepo[];
}

export async function GET() {
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    return NextResponse.json({ repositories: [] });
  }

  try {
    const res = await fetch("https://api.github.com/installation/repositories?per_page=100", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      return NextResponse.json({ repositories: [] });
    }

    const data = (await res.json()) as GitHubInstallationReposResponse;
    const repositories = data.repositories.map((r) => ({
      id: r.id,
      name: r.name,
      full_name: r.full_name,
    }));

    return NextResponse.json({ repositories });
  } catch {
    return NextResponse.json({ repositories: [] });
  }
}
