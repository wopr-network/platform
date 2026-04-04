"use client";

import type { Variants } from "framer-motion";
import { AnimatePresence, motion } from "framer-motion";
import { MenuIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.15, duration: 0.5, ease: "easeOut" as const },
  }),
};

const navLinks = [
  { label: "How It Works", href: "#how-it-works" },
  { label: "Stories", href: "#stories" },
  { label: "Pricing", href: "#pricing" },
];

const stories = [
  {
    title: "It works while you sleep.",
    body: "Regina went to bed. Her Paperclip found a gap in her university\u2019s AI law curriculum, drafted a new module, and had it in her inbox by 6am.",
  },
  {
    title: "It doesn\u2019t quit when you do.",
    body: 'Alvin said "I\u2019ll finish the chapter tomorrow" for six years. His Paperclip finished it while he was at dinner.',
  },
  {
    title: "It runs the whole thing.",
    body: "T hasn\u2019t hired anyone. His Paperclip runs engineering, ops, and customer support. The commit history is the proof.",
  },
];

export function PaperclipLanding() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-dvh text-white" style={{ background: "#09090b" }}>
      {/* Atmosphere */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background: [
            "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(99,102,241,0.15), transparent 60%)",
            "radial-gradient(ellipse 50% 40% at 80% 90%, rgba(139,92,246,0.06), transparent)",
            "radial-gradient(ellipse 40% 30% at 10% 60%, rgba(99,102,241,0.04), transparent)",
          ].join(", "),
        }}
      />
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage: [
            "linear-gradient(rgba(129,140,248,0.025) 1px, transparent 1px)",
            "linear-gradient(90deg, rgba(129,140,248,0.025) 1px, transparent 1px)",
          ].join(", "),
          backgroundSize: "40px 40px",
        }}
      />

      {/* Nav */}
      <nav
        className="fixed top-0 z-50 w-full"
        style={{
          background: "rgba(9,9,11,0.7)",
          backdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(129,140,248,0.06)",
        }}
      >
        <div className="flex items-center justify-between px-6 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5 no-underline">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-md text-sm"
              style={{
                background: "linear-gradient(135deg, #818cf8, #6366f1)",
                boxShadow: "0 0 15px rgba(99,102,241,0.3)",
              }}
            >
              📎
            </span>
            <span
              className="text-lg font-bold text-white"
              style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
            >
              Paperclip
            </span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden items-center gap-7 sm:flex">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm no-underline transition-colors"
                style={{ color: "#e4e4e7" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "#ffffff";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "#e4e4e7";
                }}
              >
                {link.label}
              </a>
            ))}
            <Link href="/login" className="text-sm no-underline transition-colors" style={{ color: "#e4e4e7" }}>
              Sign in
            </Link>
            <Link
              href="/login?tab=signup"
              className="rounded-lg px-5 py-2 text-sm font-bold no-underline transition-all"
              style={{
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
                color: "#ffffff",
                background: "linear-gradient(135deg, #818cf8, #6366f1)",
                boxShadow: "0 2px 12px rgba(99,102,241,0.3)",
              }}
            >
              Get Started
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            type="button"
            className="text-zinc-300 hover:text-white sm:hidden"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            {menuOpen ? <XIcon className="size-5" /> : <MenuIcon className="size-5" />}
          </button>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden sm:hidden"
              style={{ borderTop: "1px solid rgba(129,140,248,0.06)" }}
            >
              <div className="flex flex-col gap-1 px-6 py-4">
                {navLinks.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className="py-2 text-sm no-underline"
                    style={{ color: "#e4e4e7" }}
                  >
                    {link.label}
                  </a>
                ))}
                <div className="my-2 h-px" style={{ background: "rgba(129,140,248,0.08)" }} />
                <Link
                  href="/login"
                  onClick={() => setMenuOpen(false)}
                  className="py-2 text-sm no-underline"
                  style={{ color: "#e4e4e7" }}
                >
                  Sign in
                </Link>
                <Link
                  href="/login?tab=signup"
                  onClick={() => setMenuOpen(false)}
                  className="mt-2 inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-bold no-underline"
                  style={{
                    color: "#ffffff",
                    background: "linear-gradient(135deg, #818cf8, #6366f1)",
                  }}
                >
                  Get Started
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* Hero */}
      <section id="how-it-works" className="relative z-10 flex min-h-dvh flex-col items-center justify-center px-6">
        {/* Floating orbs */}
        <div
          className="pointer-events-none absolute"
          style={{
            width: 300,
            height: 300,
            top: "15%",
            right: "10%",
            borderRadius: "50%",
            background: "rgba(99,102,241,0.12)",
            filter: "blur(60px)",
          }}
        />
        {/* bottom-left orb removed — rendered as visible gray square */}
        <div
          className="pointer-events-none absolute"
          style={{
            width: 150,
            height: 150,
            top: "40%",
            left: "30%",
            borderRadius: "50%",
            background: "rgba(99,102,241,0.06)",
            filter: "blur(60px)",
          }}
        />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" as const }}
          className="mx-auto max-w-3xl text-center"
        >
          <h1
            className="text-5xl font-bold tracking-tight sm:text-7xl"
            style={{
              fontFamily: "'Space Grotesk', system-ui, sans-serif",
              letterSpacing: "-0.04em",
              lineHeight: 1.05,
              background: "linear-gradient(135deg, #fafafa 0%, #818cf8 50%, #a78bfa 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Your AI.
            <br />
            Your rules.
          </h1>
          <p className="mt-6 leading-relaxed" style={{ color: "#a1a1aa", fontSize: "18px" }}>
            AI agents that run your business. Deploy in seconds. They work while you sleep.
          </p>
          <div className="mt-12 flex flex-col items-center gap-4">
            <Link
              href="/login?tab=signup"
              className="rounded-xl px-10 py-4 text-base font-bold no-underline transition-all"
              style={{
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
                color: "#ffffff",
                background: "linear-gradient(135deg, #818cf8, #6366f1)",
                boxShadow: "0 4px 20px rgba(99,102,241,0.3)",
              }}
            >
              Start for free
            </Link>
            <span className="text-sm" style={{ color: "#52525b" }}>
              $5/month after trial. Cancel anytime.
            </span>
          </div>
        </motion.div>
      </section>

      {/* Divider */}
      <div
        className="relative z-10 mx-auto h-px w-full max-w-xl"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(129,140,248,0.2), transparent)",
        }}
      />

      {/* Stories */}
      <section id="stories" className="relative z-10 mx-auto max-w-xl space-y-20 px-6 py-24">
        {stories.map((story, i) => (
          <motion.div
            key={story.title}
            custom={i}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={fadeUp}
          >
            <div
              className="mb-4 inline-block h-0.5 w-8 rounded-full"
              style={{ background: "linear-gradient(90deg, #818cf8, #6366f1)" }}
            />
            <h2
              className="font-semibold tracking-tight"
              style={{
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
                letterSpacing: "-0.02em",
                fontSize: "28px",
              }}
            >
              {story.title}
            </h2>
            <p className="mt-4 leading-relaxed" style={{ color: "#71717a", fontSize: "18px", lineHeight: 1.7 }}>
              {story.body}
            </p>
          </motion.div>
        ))}
      </section>

      {/* Divider */}
      <div
        className="relative z-10 mx-auto h-px w-full max-w-xl"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(129,140,248,0.2), transparent)",
        }}
      />

      {/* Pricing */}
      <section id="pricing" className="relative z-10 mx-auto max-w-xl px-6 py-24">
        <div className="text-center mb-12">
          <h2
            className="text-2xl font-semibold tracking-tight sm:text-3xl"
            style={{
              fontFamily: "'Space Grotesk', system-ui, sans-serif",
              letterSpacing: "-0.02em",
            }}
          >
            Pay only for what you use.
          </h2>
          <p className="mt-4" style={{ color: "#71717a", fontSize: "18px", lineHeight: 1.7 }}>
            No tiers. No subscriptions. No surprises. Your agents consume credits when they work — that&apos;s it.
          </p>
        </div>

        <div
          className="rounded-2xl p-8 text-center"
          style={{
            background: "rgba(17,17,21,0.8)",
            border: "1px solid rgba(129,140,248,0.1)",
            backdropFilter: "blur(20px)",
          }}
        >
          <p className="text-sm font-medium" style={{ color: "#a1a1aa", letterSpacing: "0.05em" }}>
            EVERY ACCOUNT STARTS WITH
          </p>
          <p
            className="mt-2 text-4xl font-bold"
            style={{
              fontFamily: "'Space Grotesk', system-ui, sans-serif",
              color: "#818cf8",
            }}
          >
            $5 free
          </p>
          <p className="mt-3" style={{ color: "#71717a", fontSize: "15px" }}>
            Then add credits whenever you need them. Your agents only use credits when they&apos;re actually running.
          </p>

          <Link
            href="/login?tab=signup"
            className="mt-8 inline-block rounded-xl px-10 py-4 text-base font-bold no-underline transition-all"
            style={{
              fontFamily: "'Space Grotesk', system-ui, sans-serif",
              color: "#ffffff",
              background: "linear-gradient(135deg, #818cf8, #6366f1)",
              boxShadow: "0 4px 20px rgba(99,102,241,0.3)",
            }}
          >
            Start for free
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 px-6 py-12" style={{ borderTop: "1px solid rgba(129,140,248,0.06)" }}>
        <div className="mx-auto flex max-w-xl flex-col items-center gap-3">
          <span
            className="text-sm font-semibold"
            style={{
              fontFamily: "'Space Grotesk', system-ui, sans-serif",
              color: "#3f3f46",
            }}
          >
            Paperclip
          </span>
          <div className="flex gap-6">
            <Link href="/privacy" className="text-sm no-underline hover:text-indigo-300 transition-colors" style={{ color: "#a1a1aa" }}>
              Privacy
            </Link>
            <Link href="/terms" className="text-sm no-underline hover:text-indigo-300 transition-colors" style={{ color: "#a1a1aa" }}>
              Terms
            </Link>
          </div>
          <span className="text-sm" style={{ color: "#71717a" }}>
            runpaperclip.com
          </span>
        </div>
      </footer>
    </div>
  );
}
