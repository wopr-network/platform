"use client";

import { motion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { createInstance } from "@/lib/api";
import { cn } from "@/lib/utils";

const NAME_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

const DEFAULT_TASK_DESCRIPTION = `You are the CEO. You set the direction for the company.

- hire a founding engineer
- write a hiring plan
- break the roadmap into concrete tasks and start delegating work`;

export default function NewPaperclipInstancePage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [companyGoal, setCompanyGoal] = useState("");
  const [taskTitle, setTaskTitle] = useState("Get started");
  const [taskDescription, setTaskDescription] = useState(DEFAULT_TASK_DESCRIPTION);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function validateName(value: string): string | null {
    if (!value.trim()) return null;
    if (!NAME_PATTERN.test(value)) {
      return "Lowercase letters, numbers, and hyphens only. Must start and end with a letter or number.";
    }
    return null;
  }

  function handleNameChange(e: { target: { value: string } }) {
    const value = e.target.value;
    setName(value);
    setNameError(validateName(value));
  }

  async function handleCreate() {
    if (!name.trim()) return;
    const validation = validateName(name);
    if (validation) {
      setNameError(validation);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);

    try {
      await createInstance({
        name: name.trim(),
        provider: "opencode",
        channels: [],
        plugins: [],
        extra: {
          onboarding: {
            goal: companyGoal.trim() || undefined,
            taskTitle: taskTitle.trim() || undefined,
            taskDescription: taskDescription.trim() || undefined,
          },
        },
      });
      setCreated(true);
      setTimeout(() => router.push("/instances"), 1500);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to create instance");
      setSubmitting(false);
    }
  }

  if (created) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-6">
        <motion.div
          className="flex h-16 w-16 items-center justify-center rounded-full border border-primary/30 bg-primary/10"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        >
          <Check className="h-8 w-8 text-primary" />
        </motion.div>
        <motion.h2
          className="text-xl font-semibold"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          Instance created
        </motion.h2>
        <motion.p
          className="text-muted-foreground"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          Your Paperclip instance <span className="font-medium text-primary">&ldquo;{name}&rdquo;</span> is
          provisioning. Your CEO agent will start working shortly.
        </motion.p>
      </div>
    );
  }

  return (
    <motion.div
      className="mx-auto max-w-2xl space-y-6 py-8"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Create Paperclip Instance</h1>
        <p className="text-sm text-muted-foreground">Set up your AI company with a CEO agent ready to start working.</p>
      </div>

      {/* Step 1: Name & Goal */}
      {step === 1 && (
        <motion.div className="space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="space-y-2">
            <Label htmlFor="instance-name">Company Name</Label>
            <Input
              id="instance-name"
              placeholder="my-company"
              value={name}
              onChange={handleNameChange}
              aria-invalid={nameError !== null}
            />
            {nameError ? (
              <p className="text-xs text-red-500">{nameError}</p>
            ) : (
              <p className="text-xs text-muted-foreground/60">
                Lowercase letters, numbers, and hyphens only. This becomes your subdomain.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="company-goal">Company Goal (optional)</Label>
            <Input
              id="company-goal"
              placeholder="Build a SaaS product that helps teams collaborate"
              value={companyGoal}
              onChange={(e) => setCompanyGoal(e.target.value)}
            />
            <p className="text-xs text-muted-foreground/60">
              What should your AI company work toward? The CEO will use this to plan.
            </p>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" asChild>
              <Link href="/instances">Cancel</Link>
            </Button>
            <Button onClick={() => setStep(2)} disabled={!name.trim() || !!nameError}>
              Next
            </Button>
          </div>
        </motion.div>
      )}

      {/* Step 2: First Task */}
      {step === 2 && (
        <motion.div className="space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="rounded-md border border-border bg-muted/30 px-4 py-3">
            <p className="text-sm">
              Company: <span className="font-medium">{name}</span>
              {companyGoal && (
                <>
                  {" "}
                  — <span className="text-muted-foreground">{companyGoal}</span>
                </>
              )}
            </p>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="task-title">First Task for the CEO</Label>
            <Input
              id="task-title"
              placeholder="Get started"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-description">Task Instructions</Label>
            <textarea
              id="task-description"
              className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              placeholder="What should the CEO do first?"
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
            />
            <p className="text-xs text-muted-foreground/60">
              The CEO agent will receive this as their first assignment.
            </p>
          </div>

          {submitError && (
            <div className="rounded-md border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-500">
              {submitError}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!name.trim() || !!nameError || submitting}
              className={cn(submitting && "opacity-80")}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Instance"
              )}
            </Button>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
