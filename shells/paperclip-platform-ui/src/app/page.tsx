import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PaperclipLanding } from "@/components/landing-page";

export const metadata: Metadata = {
  title: "Paperclip — Deploy Your AI Workforce in Seconds",
  description:
    "AI agents that code, ship, and iterate while you sleep. Hire a CEO, build a team of specialists, and watch real work happen. $5 in free credits to start.",
};

export default async function Page() {
  const cookieStore = await cookies();
  const hasSession = cookieStore.getAll().some((c) => c.name.startsWith("better-auth"));
  if (hasSession) redirect("/dashboard");
  return <PaperclipLanding />;
}
