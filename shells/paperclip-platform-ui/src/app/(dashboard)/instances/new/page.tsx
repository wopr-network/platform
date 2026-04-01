"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Loader2, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createInstance } from "@/lib/api";
import {
  type ChatMessage,
  type OnboardingPlan,
  parseOnboardingStream,
  sendOnboardingChat,
} from "@/lib/onboarding-chat";
import { cn } from "@/lib/utils";

const CEO_INTRO = "I'm your CEO. Tell me what you want to build and I'll put together a plan to make it happen.";
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

  const [messages, setMessages] = useState<DisplayMessage[]>([{ id: "intro", role: "assistant", content: CEO_INTRO }]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [plan, setPlan] = useState<OnboardingPlan | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      });

      if (result.plan) {
        setPlan(result.plan);
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
      window.location.href = `https://${companyName.trim()}.runpaperclip.com`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create instance");
      setLaunching(false);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-2xl flex-col">
      {/* Message list */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto py-6">
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="flex gap-3"
            >
              <div
                className={cn(
                  "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
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
                  {streaming && i === messages.length - 1 && msg.role === "assistant" && (
                    <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-indigo-400" />
                  )}
                </div>

                {msg.plan && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-md border-l-2 border-indigo-500 bg-zinc-900 p-4"
                  >
                    <p className="mb-2 text-[10px] uppercase tracking-widest text-indigo-400">Founding Brief</p>
                    <p className="mb-1 text-sm font-semibold text-zinc-100">{msg.plan.taskTitle}</p>
                    <p className="whitespace-pre-wrap text-sm text-zinc-400">{msg.plan.taskDescription}</p>
                  </motion.div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {error && (
          <div className="ml-10 rounded-md border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-400">
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

      {/* Bottom bar */}
      <div className="space-y-3 border-t border-zinc-800 py-4">
        <AnimatePresence>
          {plan && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-start gap-2"
            >
              <div className="flex-1 space-y-1">
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
                />
                {nameError ? (
                  <p className="text-xs text-red-500">{nameError}</p>
                ) : companyName.trim() ? (
                  <p className="text-xs font-mono text-indigo-400/70">
                    {companyName
                      .toLowerCase()
                      .replace(/[^a-z0-9-]/g, "-")
                      .replace(/-+/g, "-")
                      .replace(/^-|-$/g, "")}
                    .runpaperclip.com
                  </p>
                ) : null}
              </div>
              <Button
                onClick={handleFoundCompany}
                disabled={!companyName.trim() || !!nameError || launching}
                className="shrink-0 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700"
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
            </motion.div>
          )}
        </AnimatePresence>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-2"
        >
          <Input
            ref={inputRef}
            placeholder={plan ? "Refine the plan, or name your company above..." : "Describe what you want to build..."}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={streaming}
            autoFocus
          />
          <Button type="submit" disabled={!input.trim() || streaming} variant="outline" size="icon">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
