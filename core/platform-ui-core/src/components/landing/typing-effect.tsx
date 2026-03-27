"use client";

import { useEffect, useRef, useState } from "react";

interface TypingEffectProps {
  text: string;
  speed?: number;
  className?: string;
  onComplete?: () => void;
}

export function TypingEffect({ text, speed = 50, className, onComplete }: TypingEffectProps) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    setDisplayed("");
    setDone(false);
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(interval);
        setDone(true);
        onCompleteRef.current?.();
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed]);

  return (
    <span className={className}>
      {displayed}
      <span
        className={`inline-block w-[0.6em] h-[1.1em] ml-0.5 align-text-bottom ${done ? "animate-pulse" : ""} bg-terminal`}
        aria-hidden="true"
      />
    </span>
  );
}
