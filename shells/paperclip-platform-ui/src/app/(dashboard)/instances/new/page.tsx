"use client";

import { Button } from "@core/components/ui/button";
import { Input } from "@core/components/ui/input";
import { createInstance } from "@core/lib/api";
import { cn } from "@core/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Loader2, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  type ChatMessage,
  type OnboardingPlan,
  parseOnboardingStream,
  sendOnboardingChat,
} from "@/lib/onboarding-chat";

const CEO_INTRO = "Hey — I'm going to be your CEO. You tell me what to build, and I'll hire the team, write the plan, and start executing. Real AI agents, real code, real work. So — what are we building?";

const THINKING_FIRST = [
  "Brewing coffee and drafting your founding brief...",
  "Putting on my CEO hat...",
  "Running the numbers on this one...",
  "This is a great idea. Let me think...",
  "Assembling the boardroom...",
  "Crunching market data...",
  "My AI neurons are firing...",
  "Consulting the oracle...",
];

const THINKING_UPDATE = [
  "Revising the master plan...",
  "Red-lining the brief...",
  "Updating the roadmap...",
  "Sharpening the strategy...",
  "Recalculating the trajectory...",
  "Factoring in your feedback...",
  "Pivoting gracefully...",
  "Back to the whiteboard...",
];

function _randomFrom(arr: string[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Typewriter that cycles through messages: type → pause → backspace → pause → next */
function TypewriterThinking({ messages }: { messages: string[] }) {
  const [display, setDisplay] = useState("");
  const shuffled = useRef<string[]>([]);
  const state = useRef({ idx: 0, charIdx: 0, phase: "typing" as "typing" | "pause" | "erasing" | "gap" });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Shuffle on mount
  useEffect(() => {
    shuffled.current = [...messages].sort(() => Math.random() - 0.5);
  }, [messages]);

  useEffect(() => {
    const tick = () => {
      const s = state.current;
      const pool = shuffled.current.length > 0 ? shuffled.current : messages;
      const msg = pool[s.idx % pool.length];

      if (s.phase === "typing") {
        if (s.charIdx < msg.length) {
          s.charIdx++;
          setDisplay(msg.slice(0, s.charIdx));
        } else {
          s.phase = "pause";
          timer.current = setTimeout(tick, 1500);
          return;
        }
      } else if (s.phase === "pause") {
        s.phase = "erasing";
      } else if (s.phase === "erasing") {
        if (s.charIdx > 0) {
          s.charIdx--;
          setDisplay(msg.slice(0, s.charIdx));
        } else {
          s.phase = "gap";
          timer.current = setTimeout(tick, 300);
          return;
        }
      } else if (s.phase === "gap") {
        s.idx++;
        s.charIdx = 0;
        s.phase = "typing";
      }
      const speed = s.phase === "typing" ? 30 + Math.random() * 20 : s.phase === "erasing" ? 15 : 50;
      timer.current = setTimeout(tick, speed);
    };
    timer.current = setTimeout(tick, 50);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [messages]);

  return (
    <span className="inline-flex items-center gap-2 text-sm text-indigo-400/80">
      {display}
      <span className="inline-block h-4 w-0.5 animate-pulse bg-indigo-400" />
    </span>
  );
}

/** Progress bar: monotonically increases at random intervals, token-aware, hits 100% then fades */
function ThinkingProgress({ tokenCount, done }: { tokenCount: number; done: boolean }) {
  const [progress, setProgress] = useState(0);
  const [fading, setFading] = useState(false);
  const _startTime = useRef(Date.now());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Time-based: never stops crawling, asymptotically approaches 90%
  // Feels like real progress the whole time — no stalls, no plateaus
  useEffect(() => {
    const tick = () => {
      setProgress((prev) => {
        if (prev >= 90) return prev;
        // Always moving: bigger bumps early, tiny bumps late
        const remaining = 90 - prev;
        const bump = Math.max(0.2, remaining * 0.03 * (0.4 + Math.random() * 0.8));
        return prev + bump;
      });
      // Random intervals: snappy early (300-600ms), leisurely late (800-2000ms)
      timer.current = setTimeout(tick, 300 + Math.random() * 1200);
    };
    // Instant feedback: jump to 8-15% immediately
    setTimeout(() => setProgress(8 + Math.random() * 7), 200);
    timer.current = setTimeout(tick, 800);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  // Token-based: first token jumps to 55%, then zooms toward 80% by 250 tokens,
  // 90% by 500 tokens, decaying toward 99% after that
  useEffect(() => {
    if (tokenCount > 0) {
      // Map tokens to 55→99%: fast climb then asymptotic decay
      // 1 token = 55%, 250 tokens = 80%, 500 = 90%, 1000+ → 99%
      const tokenPct = 55 + 44 * (1 - Math.exp(-tokenCount / 300));
      setProgress((prev) => Math.max(prev, Math.min(99, tokenPct)));
    }
  }, [tokenCount]);

  // Done: snap to 100% then fade
  useEffect(() => {
    if (done) {
      setProgress(100);
      const fadeTimer = setTimeout(() => setFading(true), 400);
      return () => clearTimeout(fadeTimer);
    }
  }, [done]);

  return (
    <div
      className={cn(
        "mt-2 h-1 w-48 overflow-hidden rounded-full bg-zinc-800 transition-opacity duration-500",
        fading && "opacity-0",
      )}
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

/** Combined thinking indicator: typewriter messages + progress bar */
function ThinkingIndicator({ messages, tokenCount, done }: { messages: string[]; tokenCount: number; done: boolean }) {
  return (
    <div className="space-y-1">
      <TypewriterThinking messages={messages} />
      <ThinkingProgress tokenCount={tokenCount} done={done} />
    </div>
  );
}

const NAME_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  plan?: OnboardingPlan;
}

export default function NewPaperclipInstancePage() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [messages, setMessages] = useState<DisplayMessage[]>([{ id: "intro", role: "assistant", content: "" }]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [introTyping, setIntroTyping] = useState(true);
  const [_thinking, setThinking] = useState(false);
  const [thinkingDone, setThinkingDone] = useState(false);
  const [showIndicator, setShowIndicator] = useState(false);
  const [jsonTokenCount, setJsonTokenCount] = useState(0);
  const [plan, setPlan] = useState<OnboardingPlan | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Type in the CEO intro message character by character
  useEffect(() => {
    let idx = 0;
    const speed = 25 + Math.random() * 15;
    const timer = setInterval(() => {
      idx++;
      if (idx >= CEO_INTRO.length) {
        clearInterval(timer);
        setIntroTyping(false);
        setMessages([{ id: "intro", role: "assistant", content: CEO_INTRO }]);
        inputRef.current?.focus();
        return;
      }
      setMessages([{ id: "intro", role: "assistant", content: CEO_INTRO.slice(0, idx) }]);
    }, speed);
    return () => clearInterval(timer);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: messages triggers scroll-to-bottom
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function validateName(value: string): string | null {
    if (!value.trim()) return null;
    if (!NAME_PATTERN.test(value)) {
      return "Lowercase letters, numbers, and hyphens only. Must start and end with a letter or number.";
    }
    return null;
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || streaming) return;

    setInput("");
    setError(null);

    const msgId = `msg-${Date.now()}`;
    const userMsg: DisplayMessage = { id: msgId, role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);

    // Build chat history excluding the static intro
    const history: ChatMessage[] = [
      ...messages.slice(1).map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: text },
    ];

    setMessages((prev) => [...prev, { id: `${msgId}-reply`, role: "assistant", content: "" }]);
    setStreaming(true);
    setThinking(true);
    setThinkingDone(false);
    setShowIndicator(true);
    setJsonTokenCount(0);

    try {
      const { response } = sendOnboardingChat(history);
      const body = await response;

      const result = await parseOnboardingStream(body, {
        onDelta: (delta) => {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last.role === "assistant") {
              updated[updated.length - 1] = { ...last, content: last.content + delta };
            }
            return updated;
          });
        },
        onThinking: (isThinking) => {
          setThinking(isThinking);
          if (!isThinking) {
            // Thinking ended — let progress bar hit 100% and fade before hiding
            setThinkingDone(true);
            setTimeout(() => setShowIndicator(false), 900);
          }
        },
        onJsonToken: () => setJsonTokenCount((c) => c + 1),
      });

      if (result.plan) {
        setPlan(result.plan);
        // Auto-fill suggested company name if user hasn't typed one yet
        if (result.plan.suggestedName) {
          setCompanyName(result.plan.suggestedName);
        }
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last.role === "assistant") {
            updated[updated.length - 1] = { ...last, plan: result.plan ?? undefined };
          }
          return updated;
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === "assistant" && !last.content) {
          updated.pop();
        }
        return updated;
      });
    } finally {
      setStreaming(false);
      inputRef.current?.focus();
    }
  }

  async function handleFoundCompany() {
    if (!plan || !companyName.trim() || nameError || launching) return;

    setLaunching(true);
    try {
      const goal = messages.find((m) => m.role === "user")?.content ?? "";
      await createInstance({
        name: companyName.trim(),
        provider: "opencode",
        channels: [],
        plugins: [],
        extra: {
          onboarding: {
            goal,
            taskTitle: plan.taskTitle,
            taskDescription: plan.taskDescription,
          },
        },
      });
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create instance");
      setLaunching(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Message area — scrollable, full width, content centered */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
          <AnimatePresence initial={false}>
            {messages.map((msg, i) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="flex gap-4"
              >
                <div
                  className={cn(
                    "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    msg.role === "assistant"
                      ? "bg-gradient-to-br from-indigo-500 to-purple-600 text-white"
                      : "bg-zinc-800 text-zinc-400",
                  )}
                >
                  {msg.role === "assistant" ? "C" : "Y"}
                </div>

                <div className="min-w-0 flex-1 space-y-3">
                  <p className="text-xs text-muted-foreground">{msg.role === "assistant" ? "CEO Agent" : "You"}</p>
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">
                    {msg.content}
                    {introTyping && msg.id === "intro" && (
                      <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-indigo-400" />
                    )}
                    {streaming &&
                      i === messages.length - 1 &&
                      msg.role === "assistant" &&
                      (showIndicator ? (
                        <ThinkingIndicator
                          messages={plan ? THINKING_UPDATE : THINKING_FIRST}
                          tokenCount={jsonTokenCount}
                          done={thinkingDone}
                        />
                      ) : (
                        <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-indigo-400" />
                      ))}
                  </div>

                  {msg.plan && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-lg border border-indigo-500/20 bg-zinc-900/80 p-5"
                    >
                      <p className="mb-2 text-[10px] uppercase tracking-widest text-indigo-400">Founding Brief</p>
                      <p className="mb-1 text-sm font-semibold text-zinc-100">{msg.plan.taskTitle}</p>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-400">
                        {msg.plan.taskDescription}
                      </p>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {error && (
            <div className="ml-12 rounded-md border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
              <Button
                variant="ghost"
                size="sm"
                className="ml-2 text-red-400 hover:text-red-300"
                onClick={() => setError(null)}
              >
                Dismiss
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Pinned bottom controls */}
      <div className="shrink-0 border-t border-zinc-800 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto max-w-3xl px-6 py-4 space-y-3">
          {/* Launch bar — slides in when plan is ready */}
          <AnimatePresence>
            {plan && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-3 rounded-lg border border-indigo-500/20 bg-indigo-500/[0.03] px-4 py-3">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-3">
                      <Input
                        placeholder="company-name"
                        value={companyName}
                        onChange={(e) => {
                          setCompanyName(e.target.value);
                          setNameError(validateName(e.target.value));
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleFoundCompany();
                          }
                        }}
                        aria-invalid={nameError !== null}
                        className="max-w-xs border-indigo-500/20 bg-zinc-900/50"
                      />
                      {nameError ? (
                        <p className="text-xs text-red-500">{nameError}</p>
                      ) : companyName.trim() ? (
                        <p className="text-sm font-mono text-indigo-400/70">
                          {companyName
                            .toLowerCase()
                            .replace(/[^a-z0-9-]/g, "-")
                            .replace(/-+/g, "-")
                            .replace(/^-|-$/g, "")}
                          .runpaperclip.com
                        </p>
                      ) : (
                        <p className="text-xs text-zinc-600">Your company&apos;s URL</p>
                      )}
                    </div>
                  </div>
                  <Button
                    onClick={handleFoundCompany}
                    disabled={!companyName.trim() || !!nameError || launching}
                    className="shrink-0 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white"
                  >
                    {launching ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Founding...
                      </>
                    ) : (
                      <>
                        Found Company
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Chat input — fades in after intro finishes */}
          <AnimatePresence>
            {!introTyping && (
              <motion.form
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                className="flex gap-2"
              >
                <Input
                  ref={inputRef}
                  placeholder={plan ? "Refine the plan..." : "Describe what you want to build..."}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={streaming}
                  className="animate-[pulse_1.5s_ease-in-out_0.4s_1] focus:animate-none"
                />
                <Button type="submit" disabled={!input.trim() || streaming} variant="outline" size="icon">
                  <Send className="h-4 w-4" />
                </Button>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
