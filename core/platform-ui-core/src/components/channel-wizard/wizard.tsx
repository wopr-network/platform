"use client";

import { useCallback, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { testChannelConnection } from "@/lib/api";
import type { ChannelManifest } from "@/lib/channel-manifests";
import { StepRenderer } from "./step-renderer";

interface WizardProps {
  manifest: ChannelManifest;
  onComplete: (values: Record<string, string>) => void;
  onCancel: () => void;
  submitting?: boolean;
  botId?: string;
}

export function Wizard({ manifest, onComplete, onCancel, submitting, botId }: WizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "failure" | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const step = manifest.setup[currentStep];
  const totalSteps = manifest.setup.length;
  const isLastStep = currentStep === totalSteps - 1;
  const isFirstStep = currentStep === 0;
  const progress = ((currentStep + 1) / totalSteps) * 100;

  const handleChange = useCallback((key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  function validateStep(): boolean {
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const field of step.fields) {
      let strSchema = z.string();
      if (field.required) {
        strSchema = strSchema.min(1, `${field.label} is required`);
      }
      if (field.validation?.pattern) {
        strSchema = strSchema.regex(
          new RegExp(field.validation.pattern),
          field.validation.message || "Invalid format",
        );
      }
      shape[field.key] = field.required ? strSchema : strSchema.optional().or(z.literal(""));
    }
    const schema = z.object(shape);
    const fieldValues: Record<string, string> = {};
    for (const field of step.fields) {
      fieldValues[field.key] = values[field.key] ?? "";
    }
    const result = schema.safeParse(fieldValues);
    if (result.success) {
      setErrors({});
      return true;
    }
    const stepErrors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path[0] as string;
      if (!(key in stepErrors)) {
        stepErrors[key] = issue.message;
      }
    }
    setErrors(stepErrors);
    return false;
  }

  function handleNext() {
    if (!validateStep()) return;

    if (isLastStep) {
      onComplete(values);
    } else {
      setCurrentStep((s) => s + 1);
      setTestResult(null);
      setTestError(null);
    }
  }

  function handleBack() {
    if (!isFirstStep) {
      setCurrentStep((s) => s - 1);
      setErrors({});
      setTestResult(null);
      setTestError(null);
    }
  }

  async function handleTestConnection() {
    setTesting(true);
    setTestResult(null);
    setTestError(null);
    try {
      const result = await testChannelConnection(manifest.id, values);
      setTestResult(result.success ? "success" : "failure");
      if (!result.success && result.error) {
        setTestError(result.error);
      }
    } catch {
      setTestResult("failure");
      setTestError("Could not reach the server. Check your connection.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card className="mx-auto w-full max-w-xl">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-white"
            style={{ backgroundColor: manifest.color }}
          >
            {manifest.name[0]}
          </div>
          <div>
            <CardTitle>{step.title}</CardTitle>
            <CardDescription>{step.description}</CardDescription>
          </div>
        </div>
        <div className="mt-4 space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              Step {currentStep + 1} of {totalSteps}
            </span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} />
        </div>
      </CardHeader>

      <CardContent>
        <StepRenderer
          step={step}
          values={values}
          errors={errors}
          onChange={handleChange}
          botId={botId}
        />

        {manifest.connectionTest && isLastStep && (
          <div className="mt-6 flex flex-col items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleTestConnection}
              disabled={testing}
            >
              {testing ? "Testing..." : manifest.connectionTest.label}
            </Button>
            {testResult === "success" && (
              <p className="text-sm text-emerald-500">Connection successful</p>
            )}
            {testResult === "failure" && (
              <p className="text-sm text-destructive">
                {testError || "Connection failed. Check your settings."}
              </p>
            )}
          </div>
        )}
      </CardContent>

      <CardFooter className="flex justify-between">
        <div>
          {isFirstStep ? (
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          ) : (
            <Button variant="ghost" onClick={handleBack}>
              Back
            </Button>
          )}
        </div>
        <Button onClick={handleNext} disabled={isLastStep && submitting}>
          {isLastStep && submitting ? "Connecting..." : isLastStep ? "Finish" : "Continue"}
        </Button>
      </CardFooter>
    </Card>
  );
}
