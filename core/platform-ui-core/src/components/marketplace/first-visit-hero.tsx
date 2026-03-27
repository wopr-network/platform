"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { TypingEffect } from "@/components/landing/typing-effect";
import type { PluginManifest } from "@/lib/marketplace-data";

interface FirstVisitHeroProps {
  superpowers: PluginManifest[];
  onDismiss: () => void;
}

export function FirstVisitHero({ superpowers, onDismiss }: FirstVisitHeroProps) {
  const router = useRouter();

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  function handleSelect(pluginId: string) {
    onDismiss();
    router.push(`/marketplace/${pluginId}`);
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-y-auto bg-background"
    >
      {/* Grid dot pattern background */}
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(#00FF4115_1px,transparent_1px)] bg-[size:24px_24px]"
        style={{
          maskImage: "radial-gradient(ellipse at center, black 30%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, black 30%, transparent 70%)",
        }}
      />

      {/* Radial glow */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="animate-gentle-pulse h-[600px] w-[600px] rounded-full bg-terminal/5 blur-[120px]" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center px-6 py-16">
        <h1 className="text-center text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
          <TypingEffect text="What do you want your bot to do?" speed={50} />
        </h1>

        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.8, duration: 0.6 }}
            className="mt-12 grid w-full max-w-5xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
          >
            {superpowers.map((sp, i) => (
              <motion.button
                key={sp.id}
                data-onboarding-id={`marketplace.hero.${sp.id}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 2.0 + i * 0.1, duration: 0.4 }}
                whileHover={{ scale: 1.03, boxShadow: `0 0 24px 4px ${sp.color}30` }}
                whileTap={{ scale: 0.97 }}
                onClick={() => handleSelect(sp.id)}
                className="relative overflow-hidden rounded-xl border border-border/50 bg-card p-6 text-left transition-colors hover:border-primary/40"
              >
                <div
                  className="absolute inset-0 opacity-5"
                  style={{ background: `linear-gradient(135deg, ${sp.color}, transparent)` }}
                />
                <div className="relative">
                  <div
                    className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg text-lg font-bold text-white"
                    style={{ backgroundColor: sp.color }}
                  >
                    {sp.name[0]}
                  </div>
                  <h2 className="text-lg font-bold">{sp.superpowerHeadline ?? sp.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {sp.superpowerTagline ?? sp.description}
                  </p>
                </div>
              </motion.button>
            ))}
          </motion.div>
        </AnimatePresence>

        <motion.button
          data-onboarding-id="marketplace.skip-hero"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 3.0 }}
          onClick={onDismiss}
          className="mt-8 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Skip -- browse everything
        </motion.button>
      </div>
    </motion.div>
  );
}
