"use client";

import { motion } from "framer-motion";
import { Search } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface TerminalSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function TerminalSearch({
  value,
  onChange,
  placeholder = "Search plugins...",
}: TerminalSearchProps) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <search
      className={cn(
        "flex items-center gap-2 rounded-sm border px-3 py-2 font-mono text-sm transition-all max-w-sm cursor-text",
        focused
          ? "border-primary shadow-[0_0_8px_rgba(0,255,65,0.15)]"
          : "border-input hover:border-primary/40",
      )}
      onClick={() => inputRef.current?.focus()}
      onKeyDown={(e) => {
        if (e.key === "Enter") inputRef.current?.focus();
      }}
    >
      <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="text-primary/60">$</span>
      <div className="relative flex-1">
        <input
          ref={inputRef}
          data-onboarding-id="marketplace.search"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          className="w-full bg-transparent outline-none placeholder:text-muted-foreground/50"
          aria-label="Search plugins"
        />
        {focused && value === "" && (
          <motion.span
            className="absolute left-0 top-0 text-primary pointer-events-none"
            animate={{ opacity: [1, 1, 0, 0] }}
            transition={{
              duration: 1.06,
              repeat: Infinity,
              times: [0, 0.49, 0.5, 1],
              ease: "linear",
            }}
          >
            _
          </motion.span>
        )}
      </div>
    </search>
  );
}
