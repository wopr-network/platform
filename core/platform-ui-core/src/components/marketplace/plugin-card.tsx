"use client";

import { motion, useMotionValue, useSpring } from "framer-motion";
import Link from "next/link";
import { useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { brandName } from "@/lib/brand-config";
import {
  formatInstallCount,
  getCapabilityColor,
  hasHostedOption,
  type PluginManifest,
} from "@/lib/marketplace-data";

interface PluginCardProps {
  plugin: PluginManifest;
  index?: number;
  installed?: boolean;
}

export function PluginCard({ plugin, index = 0, installed = false }: PluginCardProps) {
  const hostedAvailable = hasHostedOption(plugin.capabilities);
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
      data-plugin-card-id={plugin.id}
      data-onboarding-id={`marketplace.card.${plugin.id}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05, ease: "easeOut" }}
    >
      <Link href={`/marketplace/${plugin.id}`}>
        <motion.div
          ref={cardRef}
          style={{
            rotateX: springRotateX,
            rotateY: springRotateY,
            perspective: 800,
          }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          whileTap={{ scale: 0.98 }}
        >
          <Card className="h-full transition-colors hover:border-primary/40">
            <CardHeader>
              <div className="flex items-start gap-3">
                <motion.div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white transition-shadow"
                  style={{ backgroundColor: plugin.color }}
                  whileHover={{
                    boxShadow: `0 0 16px 4px ${plugin.color}40`,
                    rotate: [0, -5, 5, 0],
                  }}
                  transition={{ duration: 0.4 }}
                >
                  {plugin.name[0]}
                </motion.div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{plugin.name}</CardTitle>
                    <Badge variant="secondary" className="text-[10px]">
                      v{plugin.version}
                    </Badge>
                  </div>
                  <CardDescription className="mt-1 line-clamp-2">
                    {plugin.description}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {installed && (
                  <Badge variant="secondary" className="text-[10px]">
                    Installed
                  </Badge>
                )}
                {plugin.capabilities.map((cap) => {
                  const color = getCapabilityColor(cap);
                  return (
                    <Badge
                      key={cap}
                      variant="outline"
                      className={`text-[10px] ${color.bg} ${color.text} ${color.border}`}
                    >
                      {cap}
                    </Badge>
                  );
                })}
                {hostedAvailable && (
                  <Badge variant="terminal" className="text-[10px]">
                    {brandName()} Hosted
                  </Badge>
                )}
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                <span>{formatInstallCount(plugin.installCount)} installs</span>
                <span>{plugin.author}</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </Link>
    </motion.div>
  );
}
