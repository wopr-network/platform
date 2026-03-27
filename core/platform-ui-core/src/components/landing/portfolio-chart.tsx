"use client";

import { useCallback, useEffect, useRef } from "react";

interface PortfolioChartProps {
  onMilestoneRef: React.RefObject<((label: string) => void) | null>;
  onFadeStartRef: React.RefObject<(() => void) | null>;
}

const BUFFER_SIZE = 800;

function parseHexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  if (h.length === 3) {
    return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
  }
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function getTerminalColor(): [number, number, number] {
  if (typeof document === "undefined") return [0, 255, 65];
  const val = getComputedStyle(document.documentElement).getPropertyValue("--terminal").trim();
  if (val?.startsWith("#") && val.length >= 4) return parseHexToRgb(val);
  return [0, 255, 65];
}

// Color stops: [milestone, r, g, b] — base color read from CSS var
function getColorStops(): [number, number, number, number][] {
  const [r, g, b] = getTerminalColor();
  return [
    [0, r, g, b],
    [13, 245, 158, 11], // #F59E0B amber
    [26, 239, 68, 68], // #EF4444 red
    [39, 255, 255, 255], // #FFFFFF white
  ];
}

function lerpColor(a: [number, number, number], b: [number, number, number], t: number): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

function getLineColor(milestoneCount: number, now: number): string {
  const stops = getColorStops();
  const terminal: [number, number, number] = [stops[0][1], stops[0][2], stops[0][3]];

  // Pulsing phase — lerp between white and terminal
  if (milestoneCount >= 53) {
    const t = Math.sin(now * 0.004 * Math.PI) * 0.5 + 0.5;
    return lerpColor([255, 255, 255], terminal, t);
  }

  // Find surrounding stops and lerp between them
  for (let i = stops.length - 1; i >= 0; i--) {
    const [m, r, g, b] = stops[i];
    if (milestoneCount >= m) {
      const next = stops[i + 1];
      if (!next) return `rgb(${r},${g},${b})`;
      const [nm, nr, ng, nb] = next;
      const t = (milestoneCount - m) / (nm - m);
      const ease = t * t * (3 - 2 * t);
      return lerpColor([r, g, b], [nr, ng, nb], ease);
    }
  }
  return `rgb(${stops[0][1]},${stops[0][2]},${stops[0][3]})`;
}

// 1D value noise — smooth interpolation between a seeded lattice
// Produces correlated, organic motion instead of frame-to-frame random spikes
const NOISE_SIZE = 256;
const noiseTable = new Float32Array(NOISE_SIZE + 1);
for (let i = 0; i <= NOISE_SIZE; i++) noiseTable[i] = Math.random() * 2 - 1;

function smoothNoise(x: number): number {
  const xi = Math.floor(x);
  const f = x - xi;
  const u = f * f * (3 - 2 * f); // smoothstep
  const i0 = ((xi % NOISE_SIZE) + NOISE_SIZE) % NOISE_SIZE;
  const i1 = (i0 + 1) % NOISE_SIZE;
  return noiseTable[i0] * (1 - u) + noiseTable[i1] * u;
}

interface MilestoneNode {
  label: string;
  t: number;
  value: number;
  born: number;
  lifetime: number;
  color: string; // birth color — retained even when line changes phase
}

export function PortfolioChart({ onMilestoneRef, onFadeStartRef }: PortfolioChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({
    points: new Float64Array(BUFFER_SIZE * 2), // interleaved [t0, v0, t1, v1, ...]
    head: 0,
    count: 0,
    t: 0,
    value: 0,
    bias: 0.04,
    milestoneCount: 0,
    milestones: [] as MilestoneNode[],
    lastTime: 0,
    animId: 0,
    // Anchor ratchets — one-way, can only move toward vertical/top
    anchorX: 1.0, // fraction of w where current point renders (1.0 = right edge)
    anchorTopFrac: 0.3, // fraction of yRange above current point (0 = current at top edge)
    smoothedSlope: 0, // EMA of screen-space slope
    smoothedValue: 0, // EMA of s.value — viewport anchor, eliminates noise jitter
    // Set when terminal enters final-typing phase — drives the end fade
    fadeStartTime: -1,
  });

  const handleMilestone = useCallback((label: string) => {
    const s = stateRef.current;
    const now = performance.now();
    const color = getLineColor(s.milestoneCount, now);

    s.milestoneCount++;
    s.bias *= 1.18;

    const lifetime = Math.max(2000, 4000 - s.milestoneCount * 25);

    s.milestones.push({
      t: s.t,
      value: s.value,
      born: now,
      lifetime,
      color, // freeze birth color
      label,
    });
  }, []);

  // Wire milestone ref
  useEffect(() => {
    if (onMilestoneRef && "current" in onMilestoneRef) {
      (onMilestoneRef as React.MutableRefObject<((label: string) => void) | null>).current =
        handleMilestone;
    }
    return () => {
      if (onMilestoneRef && "current" in onMilestoneRef) {
        (onMilestoneRef as React.MutableRefObject<((label: string) => void) | null>).current = null;
      }
    };
  }, [handleMilestone, onMilestoneRef]);

  // Wire fade-start ref — fires when terminal enters final-typing phase
  useEffect(() => {
    const ref = onFadeStartRef as React.MutableRefObject<(() => void) | null>;
    ref.current = () => {
      stateRef.current.fadeStartTime = performance.now();
    };
    return () => {
      ref.current = null;
    };
  }, [onFadeStartRef]);

  useEffect(() => {
    // Reduced motion: skip entirely
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // DPR-aware resize
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const s = stateRef.current;
    s.lastTime = performance.now();

    const addPoint = (t: number, value: number) => {
      const idx = s.head * 2;
      s.points[idx] = t;
      s.points[idx + 1] = value;
      s.head = (s.head + 1) % BUFFER_SIZE;
      if (s.count < BUFFER_SIZE) s.count++;
    };

    const tick = (now: number) => {
      const rawDt = now - s.lastTime;
      // Cap at 3 frames to prevent jumps on tab-switch
      const dt = Math.min(rawDt, 50);
      s.lastTime = now;

      // Simulation steps (~16.67ms each)
      const steps = Math.max(1, Math.round(dt / 16.67));
      // Noise shrinks as bias grows — at high milestones the line is clearly going up
      const noiseFactor = 1.2 * Math.max(0.1, 0.92 ** s.milestoneCount);
      for (let i = 0; i < steps; i++) {
        s.t += 1;
        s.value += s.bias + smoothNoise(s.t * 0.07) * noiseFactor;
        addPoint(s.t, s.value);
      }

      // Prune dead milestones
      s.milestones = s.milestones.filter((m) => now - m.born < m.lifetime);

      // --- Draw ---
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      if (s.count < 2) {
        s.animId = requestAnimationFrame(tick);
        return;
      }

      // Smooth the viewport anchor — EMA tracks trend, not raw noise
      // Faster at start (less history), slower as chart matures
      const emaAlpha = Math.max(0.02, 0.15 - s.milestoneCount * 0.002);
      s.smoothedValue =
        s.count < 2 ? s.value : s.smoothedValue * (1 - emaAlpha) + s.value * emaAlpha;

      // Viewport — zooms in gently early, then zooms WAY out as milestones accumulate
      const yRange = 30 + s.milestoneCount * 8;
      const xSpan =
        s.milestoneCount < 30
          ? Math.max(300, 500 - s.milestoneCount * 4)
          : 380 + (s.milestoneCount - 30) * 150;
      const xRight = s.t;
      const xLeft = s.t - xSpan;

      // Screen-space slope: how far up does the chart move per pixel of rightward travel?
      const rawSlope = (s.bias * (h * xSpan)) / (w * yRange);
      s.smoothedSlope = s.smoothedSlope * 0.95 + rawSlope * 0.05;

      // slopeFactor: 0 = flat/horizontal, 1 = clearly vertical
      const slopeFactor = Math.min(1, Math.max(0, (s.smoothedSlope - 0.8) / 2.2));

      // One-way ratchets — can only move toward the vertical/top anchor, never back
      const targetAnchorX = 1.0 - slopeFactor * 0.5;
      const targetTopFrac = 0.3 * (1 - slopeFactor);
      s.anchorX = Math.min(s.anchorX, targetAnchorX);
      s.anchorTopFrac = Math.min(s.anchorTopFrac, targetTopFrac);

      // Viewport derived from smoothed anchor — steady camera, line moves within it
      const yTop = s.smoothedValue + yRange * s.anchorTopFrac;
      const yBottom = s.smoothedValue - yRange * (1 - s.anchorTopFrac);

      const toScreenX = (t: number) => ((t - xLeft) / (xRight - xLeft)) * (w * s.anchorX);
      const toScreenY = (v: number) => ((yTop - v) / (yTop - yBottom)) * h;

      // Collect visible screen points
      const screenPoints: [number, number][] = [];
      for (let i = 0; i < s.count; i++) {
        const idx = ((s.head - s.count + i + BUFFER_SIZE) % BUFFER_SIZE) * 2;
        const pt = s.points[idx];
        const pv = s.points[idx + 1];
        if (pt >= xLeft) {
          screenPoints.push([toScreenX(pt), toScreenY(pv)]);
        }
      }

      if (screenPoints.length < 2) {
        s.animId = requestAnimationFrame(tick);
        return;
      }

      const color = getLineColor(s.milestoneCount, now);

      // End-of-sequence fade: triggered when terminal enters final-typing.
      const FADE_DURATION = 2000; // ms
      const lineAlpha =
        s.fadeStartTime < 0 ? 1 : Math.max(0, 1 - (now - s.fadeStartTime) / FADE_DURATION);

      if (lineAlpha > 0.01) {
        // Layer 1: Bloom
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(screenPoints[0][0], screenPoints[0][1]);
        for (let i = 1; i < screenPoints.length; i++) {
          ctx.lineTo(screenPoints[i][0], screenPoints[i][1]);
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = 6;
        ctx.shadowColor = color;
        ctx.shadowBlur = 20;
        ctx.globalAlpha = 0.2 * lineAlpha;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
        ctx.restore();

        // Layer 2: Sharp trace
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(screenPoints[0][0], screenPoints[0][1]);
        for (let i = 1; i < screenPoints.length; i++) {
          ctx.lineTo(screenPoints[i][0], screenPoints[i][1]);
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.45 * lineAlpha;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
        ctx.restore();
      }

      // Milestone dots — also fade with lineAlpha
      for (const m of s.milestones) {
        const mx = toScreenX(m.t);
        const my = toScreenY(m.value);
        const age = (now - m.born) / m.lifetime;
        const alpha = Math.max(0, 1 - age) * lineAlpha;

        if (mx < -20 || my > h + 20 || alpha <= 0) continue;

        const outerRadius = 40 + (1 - age) * 80;
        const grad = ctx.createRadialGradient(mx, my, 0, mx, my, outerRadius);
        grad.addColorStop(0, m.color);
        grad.addColorStop(1, "transparent");

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(mx, my, outerRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = m.color;
        ctx.beginPath();
        ctx.arc(mx, my, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Label — rendered centered below the dot, fades with the milestone
        if (m.label) {
          ctx.save();
          ctx.globalAlpha = alpha * 0.85;
          ctx.fillStyle = m.color;
          ctx.font = "bold 18px 'JetBrains Mono', monospace";
          ctx.textBaseline = "top";
          ctx.textAlign = "center";
          ctx.fillText(m.label, mx, my + 16);
          ctx.restore();
        }
      }

      s.animId = requestAnimationFrame(tick);
    };

    s.animId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(s.animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-[5]" />;
}
