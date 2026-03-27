"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TERMINAL_LINES } from "./terminal-lines";

interface TerminalSequenceProps {
  onComplete?: () => void;
  onMilestone?: (label: string) => void;
  onFadeStart?: () => void;
}

// "Shall we" persists on screen — only the suffix animates
const PREFIX = "Shall we";
const PREFIX_LENGTH = PREFIX.length; // 8

function toMilestoneLabel(text: string): string {
  const stripped = text
    .replace(/^Shall we\s*/i, "")
    .replace(/\?$/, "")
    .trim();
  if (!stripped) return "";
  return `${stripped.charAt(0).toUpperCase() + stripped.slice(1)}.`;
}

// Final held lines type at near-human speed after the blur
const FINAL_TYPE_SPEED = 65; // ms/char
const FINAL_LINE_PAUSE = 200; // ms between final lines
const FINAL_BLANK_PAUSE = 300; // ms for blank line

// Cursor death sequence
const CURSOR_SOLID_HOLD = 200; // ms solid after last char
const CURSOR_BLINK_COUNT = 3;
const CURSOR_BLINK_ON = 250; // ms
const CURSOR_BLINK_OFF = 250; // ms

function getTypeDelay(lineIndex: number): number {
  // Line 0: 125ms/char → floor at line ~42 (was ~56 with 1.09)
  const factor = 1.12 ** lineIndex;
  return Math.max(1, Math.round(125 / factor));
}

function getBackspaceDelay(lineIndex: number): number {
  return Math.max(1, Math.round(getTypeDelay(lineIndex) / 2));
}

// At the floor (1ms/char) the per-char loop is pointless — just flash the line
export function isAtFloor(lineIndex: number): boolean {
  return getTypeDelay(lineIndex) === 1;
}

function getPauseAfter(lineIndex: number): number {
  if (lineIndex === 0) return 800;
  return Math.max(0, Math.round(600 * 0.82 ** lineIndex));
}

// Blur increases as speed increases — makes fast lines feel illegible, not chunky
function getTextBlur(lineIndex: number): number {
  return Math.min(8, Math.max(0, (lineIndex - 18) * 0.22));
}

type AnimState =
  | "idle"
  | "typing"
  | "pause"
  | "backspacing"
  | "final-typing"
  | "cursor-death"
  | "blinking"
  | "done";

export function TerminalSequence({ onComplete, onMilestone, onFadeStart }: TerminalSequenceProps) {
  const [lines, setLines] = useState<string[]>([]);
  const [holdLines, setHoldLines] = useState<string[]>([]);
  const [currentText, setCurrentText] = useState("");
  const [showCursor, setShowCursor] = useState(true);
  const [cursorVisible, setCursorVisible] = useState(true);
  const [animationDone, setAnimationDone] = useState(false);
  const [textBlur, setTextBlur] = useState(0);
  const bufferRef = useRef<HTMLDivElement>(null);
  const fadeStartTimeRef = useRef(-1);
  // Keep onComplete in a ref so changing the prop never restarts the animation
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const onMilestoneRef = useRef(onMilestone);
  onMilestoneRef.current = onMilestone;
  const onFadeStartRef = useRef(onFadeStart);
  onFadeStartRef.current = onFadeStart;
  const stateRef = useRef<{
    state: AnimState;
    lineIndex: number;
    charIndex: number;
    startCharIndex: number; // where typing begins for the current line
    elapsed: number;
    lastTime: number;
    blinkCount: number;
    blinkPhase: "on" | "off";
  }>({
    state: "idle",
    lineIndex: 0,
    charIndex: 0,
    startCharIndex: 0,
    elapsed: 0,
    lastTime: 0,
    blinkCount: 0,
    blinkPhase: "on",
  });
  const linesRef = useRef<string[]>([]);
  const holdLinesRef = useRef<string[]>([]);
  const currentTextRef = useRef("");
  const rafRef = useRef<number>(0);

  const updateLines = useCallback((newLines: string[]) => {
    linesRef.current = newLines;
    setLines(newLines);
  }, []);

  const updateHoldLines = useCallback((newLines: string[]) => {
    holdLinesRef.current = newLines;
    setHoldLines(newLines);
  }, []);

  const updateCurrentText = useCallback((text: string) => {
    currentTextRef.current = text;
    setCurrentText(text);
  }, []);

  useEffect(() => {
    // Check prefers-reduced-motion
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) {
      const reducedHoldLines = TERMINAL_LINES.filter((l) => l.hold);
      setHoldLines(reducedHoldLines.map((l) => l.text));
      setCurrentText("");
      setShowCursor(false);
      setAnimationDone(true);
      onCompleteRef.current?.();
      return;
    }

    const s = stateRef.current;
    s.state = "typing";
    s.lineIndex = 0;
    s.charIndex = 0;
    s.startCharIndex = 0; // Line 0 types from the very beginning
    s.elapsed = 0;
    s.lastTime = performance.now();

    const tick = (now: number) => {
      const dt = now - s.lastTime;
      s.lastTime = now;
      s.elapsed += dt;

      // Fade history buffer in sync with the chart line
      if (fadeStartTimeRef.current >= 0 && bufferRef.current && s.state !== "done") {
        const alpha = Math.max(0, 1 - (now - fadeStartTimeRef.current) / 2000);
        bufferRef.current.style.opacity = String(alpha);
      }

      switch (s.state) {
        case "typing": {
          const currentLine = TERMINAL_LINES[s.lineIndex];
          if (!currentLine) {
            s.state = "done";
            break;
          }

          if (currentLine.hold) {
            // Clear the "Shall we" prefix — final block has its own lines
            updateCurrentText("");
            s.state = "final-typing";
            fadeStartTimeRef.current = performance.now();
            onFadeStartRef.current?.();
            s.charIndex = 0;
            s.startCharIndex = 0;
            s.elapsed = 0;
            break;
          }

          const typeDelay = getTypeDelay(s.lineIndex);
          // At the floor: flash the full line in one tick — no per-char stepping
          if (isAtFloor(s.lineIndex)) {
            s.charIndex = currentLine.text.length;
            updateCurrentText(currentLine.text);
          } else {
            const charsTyped = Math.max(0, Math.floor(s.elapsed / typeDelay));
            const newIndex = Math.min(s.startCharIndex + charsTyped, currentLine.text.length);
            if (newIndex !== s.charIndex) {
              s.charIndex = newIndex;
              updateCurrentText(currentLine.text.slice(0, newIndex));
            }
          }
          if (s.charIndex >= currentLine.text.length) {
            s.state = "pause";
            s.elapsed = 0;
          }
          break;
        }

        case "pause": {
          const pauseDuration = getPauseAfter(s.lineIndex);
          if (s.elapsed >= pauseDuration) {
            // Beat has landed — commit to history, then start erasing
            const currentLine = TERMINAL_LINES[s.lineIndex];
            const newLines = [...linesRef.current, currentLine.text];
            updateLines(newLines);
            onMilestoneRef.current?.(toMilestoneLabel(currentLine.text));
            s.state = "backspacing";
            s.elapsed = 0;
          }
          break;
        }

        case "backspacing": {
          const currentLine = TERMINAL_LINES[s.lineIndex];
          // At the floor: snap straight to PREFIX_LENGTH — backspace is invisible anyway
          if (isAtFloor(s.lineIndex)) {
            updateCurrentText(currentLine.text.slice(0, PREFIX_LENGTH));
          } else {
            const bsDelay = getBackspaceDelay(s.lineIndex);
            const charsToDelete = Math.max(1, Math.floor(s.elapsed / bsDelay));
            const newLen = Math.max(PREFIX_LENGTH, currentLine.text.length - charsToDelete);
            if (newLen !== currentTextRef.current.length) {
              updateCurrentText(currentLine.text.slice(0, newLen));
            }
          }
          const newLen = currentTextRef.current.length;
          if (newLen === PREFIX_LENGTH) {
            // Line already in history — just advance to next
            s.lineIndex++;
            s.charIndex = PREFIX_LENGTH;
            s.startCharIndex = PREFIX_LENGTH;
            s.elapsed = 0;
            s.state = "typing";
            setTextBlur(getTextBlur(s.lineIndex));
          }
          break;
        }

        case "final-typing": {
          const currentLine = TERMINAL_LINES[s.lineIndex];
          if (!currentLine) {
            // Skip cursor-death — go straight to perpetual blink on the last hold line
            setAnimationDone(true);
            s.state = "blinking";
            s.elapsed = 0;
            onCompleteRef.current?.();
            break;
          }

          // Blank hold line = just a pause
          if (currentLine.text === "") {
            if (s.elapsed >= FINAL_BLANK_PAUSE) {
              const newLines = [...holdLinesRef.current, ""];
              updateHoldLines(newLines);
              onMilestoneRef.current?.("");
              s.lineIndex++;
              s.charIndex = 0;
              s.startCharIndex = 0;
              s.elapsed = 0;
            }
            break;
          }

          const charsToType = Math.max(1, Math.floor(s.elapsed / FINAL_TYPE_SPEED));
          if (charsToType > s.charIndex) {
            const newIndex = Math.min(charsToType, currentLine.text.length);
            s.charIndex = newIndex;
            updateCurrentText(currentLine.text.slice(0, newIndex));
          }
          if (s.charIndex >= currentLine.text.length) {
            // Commit this line to hold buffer (not fading history)
            const newLines = [...holdLinesRef.current, currentLine.text];
            updateHoldLines(newLines);
            onMilestoneRef.current?.(toMilestoneLabel(currentLine.text));
            updateCurrentText("");
            s.lineIndex++;
            s.charIndex = 0;
            s.startCharIndex = 0;
            s.elapsed = -FINAL_LINE_PAUSE; // negative = built-in pause before next
          }
          break;
        }

        case "cursor-death": {
          // Solid hold, then blink 3 times, then disappear
          if (s.elapsed < CURSOR_SOLID_HOLD) {
            setCursorVisible(true);
            break;
          }

          const blinkElapsed = s.elapsed - CURSOR_SOLID_HOLD;
          const cycleDuration = CURSOR_BLINK_ON + CURSOR_BLINK_OFF;
          const currentCycle = Math.floor(blinkElapsed / cycleDuration);
          const withinCycle = blinkElapsed % cycleDuration;

          if (currentCycle >= CURSOR_BLINK_COUNT) {
            setAnimationDone(true);
            s.state = "blinking";
            s.elapsed = 0;
            onCompleteRef.current?.();
            break;
          }

          setCursorVisible(withinCycle < CURSOR_BLINK_ON);
          break;
        }

        case "blinking": {
          // Perpetual blink after animation completes
          const cycleDuration = CURSOR_BLINK_ON + CURSOR_BLINK_OFF;
          setCursorVisible(s.elapsed % cycleDuration < CURSOR_BLINK_ON);
          break;
        }

        case "done":
          return; // Stop the loop
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [updateCurrentText, updateLines, updateHoldLines]);

  return (
    <div
      role="img"
      aria-label="Terminal animation showing capabilities accelerating from mundane tasks to cosmic scale"
      className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden"
    >
      {/* Grid dot background */}
      <div
        className="animate-grid-drift pointer-events-none absolute inset-0 bg-grid-dots"
        style={{
          maskImage: "radial-gradient(ellipse at center, black 40%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, black 40%, transparent 80%)",
        }}
        aria-hidden="true"
      />

      {/* Radial glow pulse */}
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
        aria-hidden="true"
      >
        <div className="animate-gentle-pulse h-[600px] w-[600px] rounded-full bg-terminal/5 blur-[120px]" />
      </div>

      {/* CRT scanlines */}
      <div className="crt-scanlines pointer-events-none absolute inset-0 z-10" />

      {/* History: viewport-anchored from 5vh down to just above 50vh.
          Both history and current-line use the same viewport reference so
          neither depends on the other's rendered height. */}
      <div
        ref={bufferRef}
        className="absolute z-20 mx-auto w-full max-w-2xl overflow-hidden px-4 font-mono text-xs leading-relaxed sm:text-sm"
        style={{
          // top 5vh → bottom calc(50vh + 14px): leaves room for the current line
          top: "5vh",
          bottom: "calc(50vh + 14px)",
          left: "50%",
          transform: "translateX(-50%)",
          ...(animationDone
            ? {}
            : {
                maskImage: "linear-gradient(to bottom, transparent 0%, black 50%)",
                WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 50%)",
              }),
        }}
      >
        {/* absolute bottom-0 anchors newest lines at container bottom;
            old lines overflow upward and are clipped + faded by the mask */}
        <div className="absolute bottom-0 flex w-full flex-col">
          {lines.map((line, i) => (
            <div
              key={`${i}-${line}`}
              className={animationDone ? "text-terminal" : "text-terminal/30"}
            >
              {line || "\u00A0"}
            </div>
          ))}
        </div>
      </div>

      {/* Hold lines — same anchor as history buffer, grows upward, never fades */}
      {holdLines.length > 0 && (
        <div
          className="absolute z-20 mx-auto w-full max-w-2xl overflow-hidden px-4 font-mono text-xs leading-relaxed text-terminal sm:text-sm"
          style={{
            top: "5vh",
            bottom: "calc(50vh + 14px)",
            left: "50%",
            transform: "translateX(-50%)",
          }}
        >
          <div className="absolute bottom-0 flex w-full flex-col">
            {holdLines.map((line, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: hold lines are append-only, index is stable
              <div key={i}>
                {line || "\u00A0"}
                {animationDone && showCursor && i === holdLines.length - 1 && (
                  <span
                    className="inline-block h-[1.1em] w-[0.6em] translate-y-[0.15em] bg-terminal"
                    style={{ opacity: cursorVisible ? 1 : 0 }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Current line — viewport-anchored at exactly 50vh, never moves */}
      {!animationDone && (
        <div
          className="absolute z-20 w-full max-w-2xl px-4 font-mono text-xs leading-relaxed sm:text-sm"
          style={{ top: "50vh", left: "50%", transform: "translate(-50%, -50%)" }}
        >
          {/* Blurred glow layer behind — intensity grows as speed increases */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute text-terminal"
            style={{
              filter: `blur(${textBlur * 2.5}px)`,
              opacity: textBlur > 0 ? 0.65 : 0,
              transition: "filter 600ms ease, opacity 600ms ease",
            }}
          >
            {currentText}
          </span>
          {/* Sharp text on top — never blurred */}
          <span className="relative text-terminal">
            {currentText}
            {showCursor && (
              <span
                data-testid="terminal-cursor"
                className="inline-block h-[1.1em] w-[0.6em] translate-y-[0.15em] bg-terminal"
                style={{ opacity: cursorVisible ? 1 : 0 }}
              />
            )}
          </span>
        </div>
      )}
    </div>
  );
}
