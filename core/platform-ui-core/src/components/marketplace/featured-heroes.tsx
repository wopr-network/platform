"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import type { PluginManifest } from "@/lib/marketplace-data";

interface FeaturedHeroesProps {
  superpowers: PluginManifest[];
  loading?: boolean;
}

export function FeaturedHeroes({ superpowers, loading }: FeaturedHeroesProps) {
  const featured = superpowers.slice(0, 4);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-7 w-52" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, n) => `fh-sk-${n}`).map((skId) => (
            <div key={skId} className="rounded-xl border border-border/50 p-6 space-y-3">
              <Skeleton className="h-14 w-14 rounded-xl" />
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (featured.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-4"
    >
      <h2 className="text-xl font-bold tracking-tight">Featured Superpowers</h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {featured.map((sp, i) => (
          <motion.div
            key={sp.id}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: i * 0.08 }}
          >
            <Link href={`/marketplace/${sp.id}`}>
              <div
                data-onboarding-id={`marketplace.featured.${sp.id}`}
                className="group relative h-full overflow-hidden rounded-xl border border-border/50 bg-card p-6 transition-all duration-200 hover:border-primary/40 hover:shadow-lg"
              >
                {/* Gradient wash */}
                <div
                  className="absolute inset-0 opacity-10 transition-opacity group-hover:opacity-15"
                  style={{ background: `linear-gradient(135deg, ${sp.color}, transparent)` }}
                />

                <div className="relative">
                  {/* Large icon */}
                  <div
                    className="mb-3 flex h-14 w-14 items-center justify-center rounded-xl text-xl font-bold text-white"
                    style={{ backgroundColor: sp.color }}
                  >
                    {sp.name[0]}
                  </div>

                  <h3 className="text-lg font-bold">{sp.superpowerHeadline ?? sp.name}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {sp.superpowerTagline ?? sp.description}
                  </p>
                </div>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
