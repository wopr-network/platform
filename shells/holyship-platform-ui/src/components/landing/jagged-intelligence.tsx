"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const peaks = [
  { x: 80, y: 60, label: "Architects a perfect billing system" },
  { x: 230, y: 45, label: "Refactors your entire API in ten minutes" },
  { x: 400, y: 55, label: "Writes comprehensive test coverage" },
  { x: 540, y: 50, label: "Designs a flawless auth flow" },
];

const valleys = [
  { x: 140, y: 260, label: "Imports a package that doesn't exist" },
  { x: 310, y: 275, label: "Silently deletes the error handling" },
  { x: 470, y: 265, label: "Every assertion is true === true" },
  { x: 600, y: 270, label: "Tells you everything passed" },
];

// Build the jagged path: sharp peaks and valleys alternating
const jaggedPoints = [
  { x: 20, y: 180 },
  peaks[0],
  valleys[0],
  peaks[1],
  valleys[1],
  peaks[2],
  valleys[2],
  peaks[3],
  valleys[3],
  { x: 660, y: 180 },
];

const jaggedPath = jaggedPoints.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");

const FLOOR_Y_START = 300;
const FLOOR_Y_END = 200;

export function JaggedIntelligence() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <div ref={ref} className="w-full max-w-4xl mx-auto">
      <svg
        viewBox="0 0 680 340"
        className="w-full"
        role="img"
        aria-label="Jagged intelligence: AI has superhuman peaks and inexplicable valleys. Holy Ship raises the floor, eliminating the valleys."
      >
        <defs>
          {/* Gradient for the valley fade effect */}
          <linearGradient id="valleyFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fafafa" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#fafafa" stopOpacity="0.02" />
          </linearGradient>

          {/* Clip path that rises to hide valleys */}
          <clipPath id="floorClip">
            <motion.rect
              x="0"
              y={inView ? FLOOR_Y_END : FLOOR_Y_START}
              width="680"
              height="340"
              animate={{ y: inView ? FLOOR_Y_END : FLOOR_Y_START }}
              transition={{ duration: 2.5, delay: 2, ease: "easeInOut" }}
            />
          </clipPath>

          {/* Mask to fade valleys below the floor */}
          <mask id="valleyMask">
            <rect x="0" y="0" width="680" height="340" fill="white" />
            <motion.rect
              x="0"
              y={FLOOR_Y_START}
              width="680"
              height="200"
              fill="black"
              animate={{
                y: inView ? FLOOR_Y_END : FLOOR_Y_START,
                opacity: inView ? 0.8 : 0,
              }}
              transition={{ duration: 2.5, delay: 2, ease: "easeInOut" }}
            />
          </mask>
        </defs>

        {/* The jagged line — draws itself */}
        <motion.path
          d={jaggedPath}
          fill="none"
          stroke="#fafafa"
          strokeWidth="2.5"
          strokeLinejoin="bevel"
          mask="url(#valleyMask)"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={inView ? { pathLength: 1, opacity: 1 } : {}}
          transition={{ duration: 1.8, ease: "easeInOut" }}
        />

        {/* Peak labels */}
        {peaks.map((peak, i) => (
          <motion.g
            key={`peak-${peak.x}`}
            initial={{ opacity: 0, y: 5 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.4, delay: 0.4 + i * 0.3 }}
          >
            <circle cx={peak.x} cy={peak.y} r="3" fill="#fafafa" fillOpacity="0.8" />
            <text
              x={peak.x}
              y={peak.y - 14}
              fill="#fafafa"
              fillOpacity="0.7"
              fontSize="10"
              fontFamily="'JetBrains Mono', monospace"
              textAnchor="middle"
            >
              {peak.label}
            </text>
          </motion.g>
        ))}

        {/* Valley labels — fade out as floor rises */}
        {valleys.map((valley, i) => (
          <motion.g
            key={`valley-${valley.x}`}
            initial={{ opacity: 0, y: -5 }}
            animate={inView ? { opacity: [0, 0.7, 0.7, 0.15] } : {}}
            transition={{
              duration: 4,
              delay: 0.6 + i * 0.3,
              times: [0, 0.15, 0.5, 1],
            }}
          >
            <circle cx={valley.x} cy={valley.y} r="3" fill="#ff6200" fillOpacity="0.6" />
            <text
              x={valley.x}
              y={valley.y + 20}
              fill="#ff6200"
              fillOpacity="0.8"
              fontSize="10"
              fontFamily="'JetBrains Mono', monospace"
              textAnchor="middle"
            >
              {valley.label}
            </text>
          </motion.g>
        ))}

        {/* The floor line — rises up, solid orange */}
        <motion.line
          x1="20"
          x2="660"
          y1={FLOOR_Y_START}
          y2={FLOOR_Y_START}
          stroke="#ff6200"
          strokeWidth="3"
          initial={{ opacity: 0 }}
          animate={
            inView
              ? {
                  y1: FLOOR_Y_END,
                  y2: FLOOR_Y_END,
                  opacity: 1,
                }
              : {}
          }
          transition={{ duration: 2.5, delay: 2, ease: "easeInOut" }}
        />

        {/* "Holy Ship" label on the floor line */}
        <motion.text
          x="340"
          y={FLOOR_Y_START - 8}
          fill="#ff6200"
          fontSize="13"
          fontFamily="'JetBrains Mono', monospace"
          fontWeight="700"
          textAnchor="middle"
          initial={{ opacity: 0 }}
          animate={
            inView
              ? {
                  y: FLOOR_Y_END - 8,
                  opacity: 1,
                }
              : {}
          }
          transition={{ duration: 2.5, delay: 2.3, ease: "easeInOut" }}
        >
          Holy Ship
        </motion.text>

        {/* Subtle fill below the floor line — the safety net */}
        <motion.rect
          x="20"
          y={FLOOR_Y_START}
          width="640"
          height="100"
          fill="#ff6200"
          fillOpacity="0"
          initial={{ opacity: 0 }}
          animate={
            inView
              ? {
                  y: FLOOR_Y_END,
                  fillOpacity: 0.06,
                  opacity: 1,
                }
              : {}
          }
          transition={{ duration: 2.5, delay: 2, ease: "easeInOut" }}
        />
      </svg>
    </div>
  );
}
