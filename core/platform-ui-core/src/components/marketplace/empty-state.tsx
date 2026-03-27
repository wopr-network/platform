"use client";

import { motion } from "framer-motion";
import { Puzzle, Sparkles } from "lucide-react";
import Link from "next/link";
import { productName } from "@/lib/brand-config";

interface EmptyStateProps {
  hasSearch: boolean;
  searchTerm?: string;
}

export function MarketplaceEmptyState({ hasSearch, searchTerm }: EmptyStateProps) {
  const suggestedPlugins = [
    { id: "discord", name: "Discord", description: "Chat & voice channels" },
    { id: "semantic-memory", name: "Semantic Memory", description: "Long-term memory" },
    { id: "elevenlabs-tts", name: "ElevenLabs TTS", description: "Voice synthesis" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center justify-center py-16 text-center"
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl border border-dashed border-primary/30">
        <Puzzle className="h-8 w-8 text-muted-foreground" />
      </div>

      {hasSearch ? (
        <>
          <p className="text-lg font-medium">No results for &ldquo;{searchTerm}&rdquo;</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try a different search term or browse by category.
          </p>
        </>
      ) : (
        <>
          <p className="text-lg font-medium">Your {productName()} could do more...</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add plugins to give your bot superpowers.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {suggestedPlugins.map((p) => (
              <Link
                key={p.id}
                href={`/marketplace/${p.id}`}
                className="flex items-center gap-2 rounded-sm border border-primary/20 px-3 py-2 text-sm transition-colors hover:bg-primary/5 hover:border-primary/40"
              >
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <span className="font-medium">{p.name}</span>
                <span className="text-muted-foreground">{p.description}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </motion.div>
  );
}
