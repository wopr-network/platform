"use client";

import { motion } from "framer-motion";
import { productName } from "@/lib/brand-config";

const stories = [
  {
    heading: "It works while you sleep.",
    get body() {
      return `Regina went to bed. Her ${productName()} found a gap in her university's AI law curriculum, drafted a new module, and had it in her inbox by 6am.`;
    },
  },
  {
    heading: "It doesn't quit when you do.",
    get body() {
      return `Alvin said "I'll finish the chapter tomorrow" for six years. His ${productName()} finished it while he was at dinner.`;
    },
  },
  {
    heading: "It runs the whole thing.",
    get body() {
      return `T hasn't hired anyone. His ${productName()} runs engineering, ops, and customer support. The commit history is the proof.`;
    },
  },
];

export function StorySections() {
  return (
    <section className="mx-auto max-w-2xl space-y-16 px-4 py-12 md:py-16">
      {stories.map((story, i) => (
        <motion.div
          key={story.heading}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{
            duration: 0.4,
            delay: i * 0.05,
            ease: "easeOut",
          }}
        >
          <h2 className="font-mono text-lg font-bold text-terminal sm:text-xl">{story.heading}</h2>
          <p className="mt-4 font-mono text-sm leading-relaxed text-terminal/60 sm:text-base">
            {story.body}
          </p>
        </motion.div>
      ))}
    </section>
  );
}
