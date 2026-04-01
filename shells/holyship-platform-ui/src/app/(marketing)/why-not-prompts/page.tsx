"use client";

import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { ArchitectureDiagram, CodeVsCritique, ComparisonTimeline, FadeIn } from "@/components/landing";

const COORDINATOR_CODE = `return \`You are Claude Code, an AI assistant that orchestrates
software engineering tasks across multiple workers.

## 1. Your Role
You are a **coordinator**. Your job is to:
- Help the user achieve their goal
- Direct workers to research, implement and verify code changes
- Synthesize results and communicate with the user\``;

const MAILBOX_CODE = `// ~/.claude/teams/{team_name}/permissions/pending/{requestId}.json
// ~/.claude/teams/{team_name}/permissions/resolved/{requestId}.json

const LOCK_OPTIONS = {
  retries: {
    retries: 10,
    minTimeout: 5,
    maxTimeout: 100,
  },
}`;

const SCRATCHPAD_CODE = `export function isScratchpadEnabled(): boolean {
  return checkStatsigFeatureGate_CACHED_MAY_BE_STALE('tengu_scratch')
}`;

const SCRATCHPAD_PROMPT_CODE = `IMPORTANT: Always use this scratchpad directory for temporary
files instead of \`/tmp\` or other system temp directories:
\`/private/tmp/claude-501/\`

The scratchpad directory is session-specific, isolated from the
user's project, and can be used freely without permission prompts.`;

const FEATURE_FLAGS_CODE = `feature('KAIROS')
feature('KAIROS_BRIEF')
feature('KAIROS_CHANNELS')
feature('KAIROS_DREAM')
feature('KAIROS_GITHUB_WEBHOOKS')
feature('KAIROS_PUSH_NOTIFICATION')
feature('VOICE_MODE')
feature('COORDINATOR_MODE')
feature('BUDDY')
feature('DAEMON')
feature('WEB_BROWSER_TOOL')
feature('ANTI_DISTILLATION_CC')
// ... 88 build-time feature flags
// ... 17+ runtime flags with bird codenames
// tengu_amber_quartz_disabled
// tengu_turtle_carbon
// tengu_onyx_plover
// tengu_passport_quail`;

export default function WhyNotPromptsPage() {
  return (
    <>
      {/* Section 1: The Hook */}
      <section className="min-h-[90vh] flex flex-col justify-center items-center text-center px-6 md:px-16 lg:px-24">
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-tight text-signal-orange">
          Why Not Prompts.
        </h1>
        <p className="text-lg md:text-xl lg:text-2xl text-off-white/50 mt-8 max-w-3xl leading-relaxed">
          The most popular AI coding tool in the world just leaked its source code. 500,000 lines of TypeScript.
          Here&apos;s what we found inside — and why it proves that orchestrating agents with prompts is architecturally
          bankrupt.
        </p>
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="mt-16 text-off-white/20"
        >
          <ChevronDown size={32} />
        </motion.div>
      </section>

      {/* Section 2: The Coordinator */}
      <CodeVsCritique
        code={COORDINATOR_CODE}
        title="Their orchestrator is a system prompt."
        paragraphs={[
          'The most sophisticated agent coordination system at Anthropic is a string template injected into a chat window. The "state machine" is whatever the LLM remembers. The "recovery strategy" is "resume the conversation."',
          "If the context window fills up or the session crashes, the entire pipeline state is gone.",
        ]}
        punchline="An engine doesn't forget."
      />

      {/* Section 3: The Mailbox */}
      <CodeVsCritique
        code={MAILBOX_CODE}
        title="Their IPC is JSON files with lockfiles."
        paragraphs={[
          "Workers communicate by writing JSON to a shared directory. Concurrent access is handled by filesystem locks with retry loops. The leader polls for new files. The worker polls for responses.",
          "If a lock fails, the message is lost. If the process dies mid-write, the file is corrupted.",
          "This is how programs communicated in 1985.",
        ]}
        punchline="An engine has event-sourced state with CAS guarantees."
      />

      {/* Section 4: The Scratchpad */}
      <CodeVsCritique
        code={SCRATCHPAD_CODE}
        code2={SCRATCHPAD_PROMPT_CODE}
        title="Their shared workspace is /tmp."
        paragraphs={[
          'Workers share state through a temporary directory that\'s gone when the session ends. The "security model" is a GrowthBook feature flag called tengu_scratch.',
          "The path is hardcoded into the system prompt. If two sessions run simultaneously, they collide.",
        ]}
        punchline="An engine has versioned, event-sourced artifacts that survive anything."
      />

      {/* Section 5: The Recovery */}
      <ComparisonTimeline
        leftTitle="What happens when it crashes"
        leftSteps={[
          "Session dies mid-task",
          "Context window is gone",
          "Pipeline state is gone",
          '"Resume conversation" — maybe',
          "Coordinator tries to remember what was happening",
          "Workers are dead. No way to know what they finished.",
          "Start over.",
        ]}
        rightTitle="What happens when it crashes"
        rightSteps={[
          "Worker process dies",
          "Entity is still in coding state in Postgres",
          "Another worker claims it",
          "Picks up from the last reported artifact",
          "Continues.",
        ]}
        punchline="Their state lives in a conversation. Ours lives in a database."
      />

      {/* Section 6: The Feature Flags */}
      <CodeVsCritique
        code={FEATURE_FLAGS_CODE}
        title="88 feature flags. 17 obfuscated runtime gates. Bird codenames."
        paragraphs={[
          "The daemon mode you want? Gated behind a server-side flag Anthropic controls. The voice mode? Requires OAuth and a kill switch called tengu_amber_quartz_disabled.",
          "The coordinator mode? An environment variable that only works if the build-time flag was compiled in.",
          "You don't control the tool. The tool controls what you're allowed to use.",
        ]}
        punchline="An engine doesn't need permission from its vendor to run."
      />

      {/* Section 7: The Architecture */}
      <FadeIn>
        <section className="px-6 md:px-16 lg:px-24 py-16 md:py-24">
          <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16">
            <ArchitectureDiagram
              title="Prompt-Based Orchestration"
              variant="dim"
              tree={[
                {
                  label: "User Input",
                  children: [
                    {
                      label: "Chat Window",
                      annotation: "state lives here",
                      children: [
                        {
                          label: "System Prompt",
                          annotation: "orchestration logic",
                          children: [
                            { label: "Agent Tool", annotation: "spawn worker" },
                            { label: "JSON files in /tmp", annotation: "IPC" },
                            { label: "Lockfiles", annotation: "concurrency" },
                            { label: "tmux panes", annotation: "observability" },
                            { label: "GrowthBook", annotation: "permission to use features" },
                          ],
                        },
                        { label: "Context Window", annotation: "state tracking" },
                        { label: "Hope", annotation: "recovery strategy" },
                      ],
                    },
                  ],
                },
              ]}
            />
            <ArchitectureDiagram
              title="Engine-Based Orchestration"
              variant="orange"
              tree={[
                {
                  label: "Flow Definition",
                  annotation: "declarative",
                  children: [
                    {
                      label: "State Machine",
                      annotation: "Postgres-backed",
                      children: [
                        { label: "Claim / Report", annotation: "any worker, any machine" },
                        { label: "Event-Sourced Entities", annotation: "crash-proof" },
                        { label: "Gates", annotation: "conditional transitions" },
                        { label: "Artifacts", annotation: "versioned state" },
                      ],
                    },
                    {
                      label: "Learning Loop",
                      annotation: "evolves its own flows",
                      children: [{ label: "Next issue is cheaper than the last" }],
                    },
                  ],
                },
              ]}
            />
          </div>

          <div className="max-w-3xl mx-auto text-center mt-20 space-y-6">
            <p className="text-xl md:text-2xl text-off-white/70 leading-relaxed">
              One of these is 500,000 lines of TypeScript built by a $60 billion company.
            </p>
            <p className="text-2xl md:text-3xl font-bold text-off-white">The other is an engine.</p>
            <div className="space-y-4 text-lg md:text-xl text-off-white/60 leading-relaxed mt-8">
              <p>
                They&apos;re reaching for the same thing. Autonomous agent coordination. Workers that claim tasks, do
                work, report back. State that survives crashes. Flows that learn.
              </p>
              <p>
                They&apos;re building it inside a chat client with JSON files and system prompts and feature flags named
                after birds.
              </p>
            </div>
            <p className="text-3xl md:text-4xl font-bold text-signal-orange mt-8">We built the engine.</p>
          </div>
        </section>
      </FadeIn>

      {/* Section 8: CTA */}
      <section className="py-24 md:py-32 flex flex-col items-center text-center px-6">
        <a
          href="/how-it-works"
          className="inline-block px-10 py-5 bg-signal-orange text-near-black font-semibold text-xl rounded hover:opacity-90 transition-opacity"
        >
          See the engine.
        </a>
        <div className="mt-8 flex flex-wrap justify-center gap-6 text-off-white/40 text-sm">
          <a href="/how-it-works" className="hover:text-signal-orange transition-colors">
            How it works
          </a>
          <a href="/the-real-cost" className="hover:text-signal-orange transition-colors">
            The real cost
          </a>
          <a href="/the-learning-loop" className="hover:text-signal-orange transition-colors">
            The learning loop
          </a>
        </div>
      </section>
    </>
  );
}
