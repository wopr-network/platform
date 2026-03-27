"use client";

import { motion, useMotionValue, useSpring } from "framer-motion";
import Link from "next/link";
import { useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PluginManifest } from "@/lib/marketplace-data";

interface SuperpowerCardProps {
  plugin: PluginManifest;
  index?: number;
  installed?: boolean;
}

export function SuperpowerCard({ plugin, index = 0, installed = false }: SuperpowerCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const springRotateX = useSpring(rotateX, { stiffness: 300, damping: 30 });
  const springRotateY = useSpring(rotateY, { stiffness: 300, damping: 30 });

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    rotateX.set(((y - centerY) / centerY) * -6);
    rotateY.set(((x - centerX) / centerX) * 6);
  }

  function handleMouseLeave() {
    rotateX.set(0);
    rotateY.set(0);
  }

  return (
    <motion.div
      data-onboarding-id={`marketplace.card.${plugin.id}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05, ease: "easeOut" }}
      style={{ perspective: 800 }}
    >
      <Link href={`/marketplace/${plugin.id}`}>
        <motion.div
          ref={cardRef}
          style={{
            rotateX: springRotateX,
            rotateY: springRotateY,
          }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          whileTap={{ scale: 0.98 }}
          className="group relative h-full overflow-hidden rounded-xl border border-border/50 bg-card p-6 transition-colors hover:border-primary/40"
        >
          {/* Gradient wash */}
          <div
            className="absolute inset-0 opacity-5 transition-opacity group-hover:opacity-10"
            style={{ background: `linear-gradient(135deg, ${plugin.color}, transparent)` }}
          />

          <div className="relative">
            {/* Icon */}
            <div
              className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold text-white"
              style={{ backgroundColor: plugin.color }}
            >
              {plugin.name[0]}
            </div>

            {installed && (
              <Badge variant="secondary" className="mb-2 text-[10px]">
                Installed
              </Badge>
            )}

            {/* Headline -- outcome copy, not tech name */}
            <h3 className="text-base font-bold">{plugin.superpowerHeadline ?? plugin.name}</h3>

            {/* Tagline */}
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              {plugin.superpowerTagline ?? plugin.description}
            </p>

            {/* CTA */}
            <Button
              data-onboarding-id={`marketplace.install.${plugin.id}`}
              size="sm"
              variant="outline"
              className="mt-4 hover:border-primary/40"
              tabIndex={-1}
            >
              {installed ? "Manage superpower" : "Give my bot this superpower"}
            </Button>
          </div>
        </motion.div>
      </Link>
    </motion.div>
  );
}
