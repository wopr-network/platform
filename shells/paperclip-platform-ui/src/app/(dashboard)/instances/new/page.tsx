"use client";

import { Button } from "@core/components/ui/button";
import { Input } from "@core/components/ui/input";
import { createInstance } from "@core/lib/api";
import { cn } from "@core/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Loader2, Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ChatMessage,
  type LLMGate,
  type OnboardingArtifacts,
  type OnboardingState,
  type PromptPhase,
  parseStateMachineStream,
  sendStateMachineChat,
} from "@/lib/onboarding-chat";

// ---------------------------------------------------------------------------
// Thinking messages
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Progress bar: monotonically increases at random intervals, token-aware
// ---------------------------------------------------------------------------

function ThinkingProgress({ tokenCount, done }: { tokenCount: number; done: boolean }) {
  const [progress, setProgress] = useState(0);
  const [fading, setFading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const tick = () => {
      setProgress((prev) => {
        if (prev >= 90) return prev;
        const remaining = 90 - prev;
        const bump = Math.max(0.2, remaining * 0.03 * (0.4 + Math.random() * 0.8));
        return prev + bump;
      });
      timer.current = setTimeout(tick, 300 + Math.random() * 1200);
    };
    setTimeout(() => setProgress(8 + Math.random() * 7), 200);
    timer.current = setTimeout(tick, 800);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    if (tokenCount > 0) {
      const tokenPct = 55 + 44 * (1 - Math.exp(-tokenCount / 300));
      setProgress((prev) => Math.max(prev, Math.min(99, tokenPct)));
    }
  }, [tokenCount]);

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

// ---------------------------------------------------------------------------
// Typewriter thinking indicator
// ---------------------------------------------------------------------------

function TypewriterThinking({ messages }: { messages: string[] }) {
  const [display, setDisplay] = useState("");
  const shuffled = useRef<string[]>([]);
  const state = useRef({ idx: 0, charIdx: 0, phase: "typing" as "typing" | "pause" | "erasing" | "gap" });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

function ThinkingIndicator({ messages, tokenCount, done }: { messages: string[]; tokenCount: number; done: boolean }) {
  return (
    <div className="space-y-1">
      <TypewriterThinking messages={messages} />
      <ThinkingProgress tokenCount={tokenCount} done={done} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// State machine types
// ---------------------------------------------------------------------------

interface OnboardingContext {
  state: OnboardingState;
  phase: PromptPhase;
  history: ChatMessage[];
  artifacts: OnboardingArtifacts;
}

interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Show founding brief artifact card */
  brief?: { taskTitle: string; taskDescription: string };
}

const STATE_ORDER: OnboardingState[] = ["VISION", "COMPANY_NAME", "CEO_NAME", "LAUNCH"];

function nextState(current: OnboardingState): OnboardingState | null {
  const idx = STATE_ORDER.indexOf(current);
  return idx >= 0 && idx < STATE_ORDER.length - 1 ? STATE_ORDER[idx + 1] : null;
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function NewPaperclipInstancePage() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [ctx, setCtx] = useState<OnboardingContext>({
    state: "VISION",
    phase: "entry",
    history: [],
    artifacts: {},
  });

  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [_thinking, setThinking] = useState(false);
  const [thinkingDone, setThinkingDone] = useState(false);
  const [showIndicator, setShowIndicator] = useState(false);
  const [jsonTokenCount, setJsonTokenCount] = useState(0);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Track whether we need to auto-fire an entry prompt
  const [pendingEntry, setPendingEntry] = useState(true);
  // Track whether input should be shown (hidden during entry prompts)
  const [showInput, setShowInput] = useState(false);

  // Scroll to bottom on message changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: messages triggers scroll-to-bottom
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // -------------------------------------------------------------------------
  // Core: fire an LLM call
  // -------------------------------------------------------------------------

  const fireLLM = useCallback(
    async (chatHistory: ChatMessage[], state: OnboardingState, phase: PromptPhase, artifacts: OnboardingArtifacts) => {
      const replyId = `reply-${Date.now()}`;
      setMessages((prev) => [...prev, { id: replyId, role: "assistant", content: "" }]);
      setStreaming(true);
      setThinking(true);
      setThinkingDone(false);
      setShowIndicator(true);
      setJsonTokenCount(0);
      setError(null);

      let gate: LLMGate = { ready: false };

      try {
        const { response } = sendStateMachineChat(chatHistory, state, phase, artifacts);
        const body = await response;

        const result = await parseStateMachineStream(body, {
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
              setThinkingDone(true);
              setTimeout(() => setShowIndicator(false), 900);
            }
          },
          onJsonToken: () => setJsonTokenCount((c) => c + 1),
        });

        gate = result.gate;
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
        setStreaming(false);
        setShowInput(true);
        return;
      }

      setStreaming(false);
      return gate;
    },
    [],
  );

  // -------------------------------------------------------------------------
  // Handle state transitions after receiving a gate
  // -------------------------------------------------------------------------

  const handleGate = useCallback((gate: LLMGate, currentCtx: OnboardingContext): OnboardingContext => {
    // Entry phase always returns ready:false -> switch to continue, show input
    if (currentCtx.phase === "entry") {
      const newCtx = { ...currentCtx, phase: "continue" as PromptPhase };
      setShowInput(true);
      return newCtx;
    }

    // Continue phase: not ready -> stay in state, keep input open
    if (!gate.ready) {
      setShowInput(true);
      return currentCtx;
    }

    // Ready: true -> collect artifact and advance
    const artifact = (gate.artifact ?? {}) as Record<string, string>;
    let newArtifacts = { ...currentCtx.artifacts };

    switch (currentCtx.state) {
      case "VISION": {
        newArtifacts = {
          ...newArtifacts,
          taskTitle: artifact.taskTitle,
          taskDescription: artifact.taskDescription,
          suggestedName: artifact.suggestedName,
        };
        // Attach brief card to the last assistant message
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last.role === "assistant") {
            updated[updated.length - 1] = {
              ...last,
              brief: {
                taskTitle: artifact.taskTitle ?? "",
                taskDescription: artifact.taskDescription ?? "",
              },
            };
          }
          return updated;
        });
        break;
      }
      case "COMPANY_NAME": {
        newArtifacts = { ...newArtifacts, companyName: artifact.companyName };
        break;
      }
      case "CEO_NAME": {
        newArtifacts = { ...newArtifacts, ceoName: artifact.ceoName };
        break;
      }
      case "LAUNCH": {
        // Refinement: overwrite all artifacts
        newArtifacts = {
          ...newArtifacts,
          companyName: artifact.companyName ?? newArtifacts.companyName,
          ceoName: artifact.ceoName ?? newArtifacts.ceoName,
          taskTitle: artifact.taskTitle ?? newArtifacts.taskTitle,
          taskDescription: artifact.taskDescription ?? newArtifacts.taskDescription,
        };
        setShowInput(true);
        return { ...currentCtx, artifacts: newArtifacts };
      }
    }

    // Advance to next state
    const next = nextState(currentCtx.state);
    if (next) {
      const newCtx: OnboardingContext = {
        state: next,
        phase: "entry",
        history: currentCtx.history,
        artifacts: newArtifacts,
      };
      setShowInput(false);
      setPendingEntry(true);
      return newCtx;
    }

    setShowInput(true);
    return { ...currentCtx, artifacts: newArtifacts };
  }, []);

  // -------------------------------------------------------------------------
  // Auto-fire entry prompts when pendingEntry is true
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!pendingEntry || streaming) return;

    // LAUNCH has no entry prompt — show the launch button + input immediately
    if (ctx.state === "LAUNCH") {
      setPendingEntry(false);
      setShowInput(true);
      return;
    }

    // VISION entry: type in a hardcoded intro instead of calling the LLM
    if (ctx.state === "VISION" && ctx.phase === "entry") {
      setPendingEntry(false);
      const intro = `Hey — I'm going to be your CEO. You describe what you want built, and I take it from there. I'll put together a founding brief, hire the right agents, assign the work, and get things moving. Real engineers writing real code, managed by me.\n\nSo tell me — what are we building? Don't worry about being specific yet. Just paint the picture and I'll figure out what we need to make it happen.`;
      const introId = `intro-${Date.now()}`;
      setMessages([{ id: introId, role: "assistant", content: "" }]);

      // Typewriter effect
      let idx = 0;
      const typeTimer = setInterval(() => {
        idx++;
        if (idx >= intro.length) {
          clearInterval(typeTimer);
          setMessages([{ id: introId, role: "assistant", content: intro }]);
          setCtx((prev) => ({
            ...prev,
            phase: "continue",
            history: [{ role: "assistant" as const, content: intro }],
          }));
          setShowInput(true);
          inputRef.current?.focus();
          return;
        }
        setMessages([{ id: introId, role: "assistant", content: intro.slice(0, idx) }]);
      }, 20);
      return () => clearInterval(typeTimer);
    }

    // All other entry prompts: fire LLM
    setPendingEntry(false);

    (async () => {
      const gate = await fireLLM(ctx.history, ctx.state, "entry", ctx.artifacts);
      if (!gate) return; // error occurred

      // Add the assistant response to history
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && last.content) {
          setCtx((prevCtx) => {
            const updatedHistory = [...prevCtx.history, { role: "assistant" as const, content: last.content }];
            const newCtx = handleGate(gate, { ...prevCtx, history: updatedHistory });
            return newCtx;
          });
        }
        return prev;
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingEntry, ctx.state, handleGate]);

  // -------------------------------------------------------------------------
  // Handle user sending a message
  // -------------------------------------------------------------------------

  async function handleSend() {
    const text = input.trim();
    if (!text || streaming) return;

    setInput("");
    setError(null);

    const msgId = `msg-${Date.now()}`;
    const userMsg: DisplayMessage = { id: msgId, role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);

    const userChatMsg: ChatMessage = { role: "user", content: text };
    const newHistory = [...ctx.history, userChatMsg];

    // Fire the continue prompt
    const gate = await fireLLM(newHistory, ctx.state, "continue", ctx.artifacts);
    if (!gate) return; // error occurred

    // Get the assistant's reply from messages
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant" && last.content) {
        const updatedHistory = [...newHistory, { role: "assistant" as const, content: last.content }];
        setCtx((prevCtx) => {
          const newCtx = handleGate(gate, { ...prevCtx, history: updatedHistory });
          return newCtx;
        });
      }
      return prev;
    });

    inputRef.current?.focus();
  }

  // -------------------------------------------------------------------------
  // Launch: create instance with all artifacts
  // -------------------------------------------------------------------------

  async function handleFoundCompany() {
    const { companyName, taskTitle, taskDescription, ceoName } = ctx.artifacts;
    if (!companyName || !taskTitle || !taskDescription || !ceoName || launching) return;

    setLaunching(true);
    try {
      await createInstance({
        name: companyName,
        provider: "opencode",
        channels: [],
        plugins: [],
        extra: {
          onboarding: {
            goal: taskTitle,
            taskTitle,
            taskDescription,
          },
          ceoName,
        },
      });
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create instance");
      setLaunching(false);
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const ceoLabel = ctx.artifacts.ceoName || "CEO Agent";
  const hasAllArtifacts = !!(
    ctx.artifacts.companyName &&
    ctx.artifacts.taskTitle &&
    ctx.artifacts.taskDescription &&
    ctx.artifacts.ceoName
  );

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Message area */}
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
                  <p className="text-xs text-muted-foreground">{msg.role === "assistant" ? ceoLabel : "You"}</p>
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">
                    {msg.content}
                    {streaming &&
                      i === messages.length - 1 &&
                      msg.role === "assistant" &&
                      (showIndicator ? (
                        <ThinkingIndicator
                          messages={ctx.artifacts.taskTitle ? THINKING_UPDATE : THINKING_FIRST}
                          tokenCount={jsonTokenCount}
                          done={thinkingDone}
                        />
                      ) : (
                        msg.content && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-indigo-400" />
                      ))}
                  </div>

                  {msg.brief && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-lg border border-indigo-500/20 bg-zinc-900/80 p-5"
                    >
                      <p className="mb-2 text-[10px] uppercase tracking-widest text-indigo-400">Founding Brief</p>
                      <p className="mb-1 text-sm font-semibold text-zinc-100">{msg.brief.taskTitle}</p>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-400">
                        {msg.brief.taskDescription}
                      </p>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Launch state: prominent button in the conversation flow */}
          <AnimatePresence>
            {ctx.state === "LAUNCH" && hasAllArtifacts && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="flex justify-center py-4"
              >
                <Button
                  onClick={handleFoundCompany}
                  disabled={launching}
                  size="lg"
                  className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white px-8 py-6 text-base"
                >
                  {launching ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Founding {ctx.artifacts.companyName}...
                    </>
                  ) : (
                    <>
                      Found {ctx.artifacts.companyName} with CEO {ctx.artifacts.ceoName}
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </>
                  )}
                </Button>
              </motion.div>
            )}
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
          {/* Chat input */}
          <AnimatePresence>
            {showInput && (
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
                  placeholder={
                    ctx.state === "LAUNCH"
                      ? "Want to change anything before launch?"
                      : ctx.state === "VISION"
                        ? "Describe what you want to build..."
                        : ctx.state === "COMPANY_NAME"
                          ? "Name your company..."
                          : "Name your CEO..."
                  }
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={streaming}
                  className="animate-[pulse_1.5s_ease-in-out_0.4s_1] focus:animate-none"
                  autoFocus
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
