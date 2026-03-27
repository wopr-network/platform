"use client";

import { motion } from "framer-motion";
import { Bot, ChevronRight, Rocket, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getBrandConfig, storageKey } from "@/lib/brand-config";
import { presets } from "@/lib/onboarding-data";
import {
  isOnboardingComplete,
  loadOnboardingState,
  markOnboardingComplete,
  saveOnboardingState,
} from "@/lib/onboarding-store";

const homePath = () => getBrandConfig().homePath;
const MAX_STEP = 2;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [botName, setBotName] = useState("");
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  useEffect(() => {
    if (isOnboardingComplete()) {
      router.push(homePath());
      return;
    }
    const saved = loadOnboardingState();
    const restoredStep = saved.currentStep;
    if (!Number.isNaN(restoredStep) && restoredStep >= 0 && restoredStep <= MAX_STEP) {
      setStep(restoredStep);
    }
    if (saved.instanceName) {
      setBotName(saved.instanceName);
    }
    try {
      const savedPreset = localStorage.getItem(storageKey("onboarding-preset"));
      if (savedPreset) setSelectedPreset(savedPreset);
    } catch {
      // ignore — storage may be blocked
    }
  }, [router.push]);

  useEffect(() => {
    try {
      if (selectedPreset) {
        localStorage.setItem(storageKey("onboarding-preset"), selectedPreset);
      }
    } catch {
      // ignore
    }
  }, [selectedPreset]);

  function handleNameNext() {
    if (!botName.trim()) return;
    saveOnboardingState({ ...loadOnboardingState(), instanceName: botName.trim(), currentStep: 1 });
    setStep(1);
  }

  function handlePresetNext() {
    if (!selectedPreset) return;
    saveOnboardingState({ ...loadOnboardingState(), currentStep: 2 });
    setStep(2);
  }

  function handleLaunch() {
    const state = loadOnboardingState();
    const preset = presets.find((p) => p.id === selectedPreset);
    saveOnboardingState({
      ...state,
      instanceName: botName.trim(),
      channels: preset?.channels ?? [],
      plugins: preset?.plugins ?? state.plugins,
    });
    markOnboardingComplete();
    router.push(homePath());
  }

  function handleSkip() {
    markOnboardingComplete();
    router.push(homePath());
  }

  const selectedPresetData = presets.find((p) => p.id === selectedPreset);

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Progress */}
        <div className="mb-6 flex items-center justify-center gap-2">
          {[0, 1, 2].map((s) => (
            <div
              key={s}
              className={`h-1.5 w-12 rounded-full transition-colors ${
                s <= step ? "bg-terminal" : "bg-terminal/20"
              }`}
            />
          ))}
        </div>

        {step === 0 && (
          <motion.div
            key="step-0"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <Card className="crt-scanlines border-terminal/20 bg-black/80 shadow-[0_0_30px_rgba(0,255,65,0.08)]">
              <CardHeader className="items-center text-center">
                <div className="rounded-full bg-terminal/10 p-3">
                  <Bot className="size-8 text-terminal" />
                </div>
                <CardTitle className="text-sm font-medium uppercase tracking-widest text-terminal">
                  Name your bot
                </CardTitle>
                <CardDescription>Give your bot a name. You can change this later.</CardDescription>
              </CardHeader>
              <CardContent>
                <Input
                  data-onboarding-id="onboarding.name-bot"
                  placeholder="e.g. Jarvis, Friday, HAL..."
                  value={botName}
                  onChange={(e) => setBotName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleNameNext()}
                  className="border-terminal/20 bg-black/50 text-center text-lg"
                  autoFocus
                />
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button variant="ghost" size="sm" onClick={handleSkip}>
                  Skip setup
                </Button>
                <Button
                  data-onboarding-id="onboarding.continue.name"
                  variant="terminal"
                  onClick={handleNameNext}
                  disabled={!botName.trim()}
                >
                  Next <ChevronRight className="ml-1 size-4" />
                </Button>
              </CardFooter>
            </Card>
          </motion.div>
        )}

        {step === 1 && (
          <motion.div
            key="step-1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <Card className="crt-scanlines border-terminal/20 bg-black/80 shadow-[0_0_30px_rgba(0,255,65,0.08)]">
              <CardHeader className="items-center text-center">
                <div className="rounded-full bg-terminal/10 p-3">
                  <Sparkles className="size-8 text-terminal" />
                </div>
                <CardTitle className="text-sm font-medium uppercase tracking-widest text-terminal">
                  Pick a preset
                </CardTitle>
                <CardDescription>
                  Choose a starting configuration. You can customize everything later.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {presets
                  .filter((p) => p.id !== "custom")
                  .map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      data-onboarding-id={`onboarding.select-preset.${p.id}`}
                      onClick={() => setSelectedPreset(p.id)}
                      className={`w-full rounded-md border px-4 py-3 text-left transition-colors ${
                        selectedPreset === p.id
                          ? "border-terminal bg-terminal/10 text-terminal"
                          : "border-terminal/20 bg-black/30 text-muted-foreground hover:border-terminal/40"
                      }`}
                    >
                      <div className="text-sm font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.description}</div>
                    </button>
                  ))}
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button variant="ghost" size="sm" onClick={() => setStep(0)}>
                  Back
                </Button>
                <Button
                  data-onboarding-id="onboarding.continue.preset"
                  variant="terminal"
                  onClick={handlePresetNext}
                  disabled={!selectedPreset}
                >
                  Next <ChevronRight className="ml-1 size-4" />
                </Button>
              </CardFooter>
            </Card>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            key="step-2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <Card className="crt-scanlines border-terminal/20 bg-black/80 shadow-[0_0_30px_rgba(0,255,65,0.08)]">
              <CardHeader className="items-center text-center">
                <div className="rounded-full bg-terminal/10 p-3">
                  <Rocket className="size-8 text-terminal" />
                </div>
                <CardTitle className="text-sm font-medium uppercase tracking-widest text-terminal">
                  Ready to launch
                </CardTitle>
                <CardDescription>Here&apos;s what we&apos;ll set up for you.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between rounded-sm border border-terminal/10 px-3 py-2">
                  <span className="text-muted-foreground">Bot name</span>
                  <span className="font-medium text-terminal">{botName}</span>
                </div>
                <div className="flex items-center justify-between rounded-sm border border-terminal/10 px-3 py-2">
                  <span className="text-muted-foreground">Preset</span>
                  <span className="font-medium text-terminal">{selectedPresetData?.name}</span>
                </div>
                {selectedPresetData && selectedPresetData.channels.length > 0 && (
                  <div className="flex items-center justify-between rounded-sm border border-terminal/10 px-3 py-2">
                    <span className="text-muted-foreground">Channels</span>
                    <span className="font-medium text-terminal">
                      {selectedPresetData.channels.join(", ")}
                    </span>
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button
                  data-onboarding-id="onboarding.launch"
                  variant="terminal"
                  onClick={handleLaunch}
                >
                  Launch <Rocket className="ml-1 size-4" />
                </Button>
              </CardFooter>
            </Card>
          </motion.div>
        )}
      </div>
    </div>
  );
}
