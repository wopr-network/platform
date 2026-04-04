import type { Metadata } from "next";
import { LandingPage } from "@/components/landing-page";

export const metadata: Metadata = {
  title: "Paperclip — Deploy Your AI Workforce in Seconds",
  description:
    "AI agents that code, ship, and iterate while you sleep. Hire a CEO, build a team of specialists, and watch real work happen. $5 in free credits to start.",
};

export default function Page() {
  return <LandingPage />;
}
