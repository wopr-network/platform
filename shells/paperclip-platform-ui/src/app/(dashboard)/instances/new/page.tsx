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
  phase: PromptPhase; // "initial" = first user message in this state, "followup" = subsequent
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
    phase: "initial",
    history: [],
    artifacts: {},
  });
  // Ref always mirrors latest ctx — avoids stale closures in async handlers
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [_thinking, setThinking] = useState(false);
  const [thinkingDone, setThinkingDone] = useState(false);
  const [showIndicator, setShowIndicator] = useState(false);
  const [jsonTokenCount, setJsonTokenCount] = useState(0);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Input shows after intro finishes typing
  const [introDone, setIntroDone] = useState(false);

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
    // Not ready -> stay in state, switch to followup phase for next message
    if (!gate.ready) {
      return { ...currentCtx, phase: "followup" };
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
        return { ...currentCtx, artifacts: newArtifacts };
      }
    }

    // Advance to next state with phase "initial"
    const next = nextState(currentCtx.state);
    if (next) {
      return {
        state: next,
        phase: "initial",
        history: currentCtx.history,
        artifacts: newArtifacts,
      };
    }

    return { ...currentCtx, artifacts: newArtifacts };
  }, []);

  // -------------------------------------------------------------------------
  // Type hardcoded VISION intro on mount — no LLM call
  // -------------------------------------------------------------------------

  const introStarted = useRef(false);
  useEffect(() => {
    if (introStarted.current) return;
    introStarted.current = true;

    const intro =
      "Hey! I'm your CEO. Here's how this works:\n\nYou tell me what you want to build. I figure out what we need, hire a team of AI agents, and start executing. Engineers, designers, researchers \u2014 whatever the project calls for. They'll write real code, file real issues, and ship real work. You watch it all happen live.\n\nThink of it like founding a startup, except your entire team is ready in seconds. I handle the org chart, the task breakdown, the hiring, and the day-to-day. You just set the direction.\n\nSo what's the idea? Describe it however you want \u2014 a sentence, a paragraph, a wall of text. I'll take it from there.";
    const introId = "intro";
    setMessages([{ id: introId, role: "assistant", content: "" }]);

    let idx = 0;
    function typeNext() {
      idx += 3;
      if (idx > intro.length) {
        setMessages([{ id: introId, role: "assistant", content: intro }]);
        setCtx((prev) => ({
          ...prev,
          history: [{ role: "assistant" as const, content: intro }],
        }));
        setIntroDone(true);
        setTimeout(() => inputRef.current?.focus(), 100);
        return;
      }
      setMessages([{ id: introId, role: "assistant", content: intro.slice(0, idx) }]);
      setTimeout(typeNext, 10);
    }
    setTimeout(typeNext, 200);
  }, []);

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
    const cur = ctxRef.current;
    const newHistory = [...cur.history, userChatMsg];

    // Fire the prompt — "initial" on first message in state, "followup" after ready:false
    const gate = await fireLLM(newHistory, cur.state, cur.phase, cur.artifacts);
    if (!gate) return; // error occurred

    // Read the assistant's reply content from the DOM (messages state may be stale in closures)
    // Use a microtask to ensure React has flushed the streaming updates
    await new Promise((r) => setTimeout(r, 50));

    // Get the last assistant message content
    let assistantContent = "";
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant") {
        assistantContent = last.content;
      }
      return prev;
    });

    // Wait for the setMessages read to flush
    await new Promise((r) => setTimeout(r, 0));

    const updatedHistory = [...newHistory, { role: "assistant" as const, content: assistantContent }];
    // Use setCtx callback to read the LATEST ctx (avoids stale closure)
    setCtx((prevCtx) => {
      const newCtx = handleGate(gate, { ...prevCtx, history: updatedHistory });
      console.log("[onboarding] gate result", {
        prevState: prevCtx.state,
        newState: newCtx.state,
        ready: gate.ready,
        artifacts: Object.keys(newCtx.artifacts).filter((k) => !!(newCtx.artifacts as Record<string, unknown>)[k]),
      });
      return newCtx;
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
          {/* Chat input */}
          <AnimatePresence>
            {introDone && (
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

          {/* Launch button — appears below input when all artifacts collected */}
          <AnimatePresence>
            {ctx.state === "LAUNCH" && hasAllArtifacts && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              >
                <Button
                  onClick={handleFoundCompany}
                  disabled={launching}
                  className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white text-sm"
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
        </div>
      </div>
    </div>
  );
}
