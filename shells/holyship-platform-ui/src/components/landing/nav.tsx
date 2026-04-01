"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const links = [
  { href: "/how-it-works", label: "How It Works" },
  { href: "/the-real-cost", label: "The Real Cost" },
  { href: "/the-learning-loop", label: "The Learning Loop" },
  { href: "/vibe-coding-vs-engineering", label: "Vibe vs. Engineering" },
  { href: "/why-not-prompts", label: "Why Not Prompts" },
];

export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-near-black/90 backdrop-blur-sm border-b border-off-white/5">
      <div className="max-w-7xl mx-auto px-6 md:px-16 lg:px-24 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-1 shrink-0">
          <span className="font-mono text-xs font-bold text-signal-orange tracking-wider">HOLY</span>
          <span className="font-mono text-lg font-black text-off-white leading-none -ml-0.5">SHIP</span>
        </Link>

        <div className="hidden md:flex items-center gap-6">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm transition-colors ${
                pathname === link.href ? "text-signal-orange" : "text-off-white/50 hover:text-off-white"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="px-4 py-1.5 bg-signal-orange text-near-black text-sm font-semibold rounded hover:opacity-90 transition-opacity"
          >
            Get Started
          </Link>

          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="md:hidden p-1.5 text-off-white/60 hover:text-off-white transition-colors"
            aria-label="Toggle menu"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              {open ? (
                <>
                  <line x1="4" y1="4" x2="16" y2="16" />
                  <line x1="16" y1="4" x2="4" y2="16" />
                </>
              ) : (
                <>
                  <line x1="3" y1="5" x2="17" y2="5" />
                  <line x1="3" y1="10" x2="17" y2="10" />
                  <line x1="3" y1="15" x2="17" y2="15" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <div className="md:hidden border-t border-off-white/5 bg-near-black/95 backdrop-blur-sm px-6 py-4 space-y-3">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className={`block text-sm transition-colors ${
                pathname === link.href ? "text-signal-orange" : "text-off-white/50 hover:text-off-white"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
