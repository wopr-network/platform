import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Why Not Prompts — 500,000 Lines of Leaked Source Code",
  description:
    "The most popular AI coding tool leaked its source. JSON files for IPC, /tmp for state, bird-codename feature flags. They're building it with prompts. We built the engine.",
};

export default function WhyNotPromptsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
