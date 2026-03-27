import Link from "next/link";
import { brandName } from "@/lib/brand-config";

export function LandingNav() {
  return (
    <nav className="fixed top-0 z-50 flex w-full items-center justify-between px-6 py-4">
      <Link
        href="/"
        className="font-mono text-sm font-semibold text-terminal/60 transition-colors duration-150 hover:text-terminal"
      >
        {brandName()}
      </Link>
      <Link
        href="/login"
        className="font-mono text-sm text-terminal/60 underline underline-offset-4 transition-colors duration-150 hover:text-terminal"
      >
        Sign in
      </Link>
    </nav>
  );
}
