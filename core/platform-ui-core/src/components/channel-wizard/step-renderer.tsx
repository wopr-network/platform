"use client";

import { Banner } from "@/components/ui/banner";
import type { ConfigField, SetupStep } from "@/lib/channel-manifests";
import { FieldInteractive } from "./field-interactive";
import { FieldOAuth } from "./field-oauth";
import { FieldPaste } from "./field-paste";
import { FieldQR } from "./field-qr";

interface StepRendererProps {
  step: SetupStep;
  values: Record<string, string>;
  errors: Record<string, string>;
  onChange: (key: string, value: string) => void;
  botId?: string;
}

function renderField(
  field: ConfigField,
  value: string,
  onChange: (key: string, value: string) => void,
  error?: string,
  botId?: string,
) {
  switch (field.setupFlow) {
    case "oauth":
      return (
        <FieldOAuth key={field.key} field={field} value={value} onChange={onChange} error={error} />
      );
    case "qr":
      return (
        <FieldQR
          key={field.key}
          field={field}
          value={value}
          onChange={onChange}
          error={error}
          botId={botId}
        />
      );
    case "interactive":
      return (
        <FieldInteractive
          key={field.key}
          field={field}
          value={value}
          onChange={onChange}
          error={error}
        />
      );
    default:
      return (
        <FieldPaste key={field.key} field={field} value={value} onChange={onChange} error={error} />
      );
  }
}

export function StepRenderer({ step, values, errors, onChange, botId }: StepRendererProps) {
  const hasFields = step.fields.length > 0;

  return (
    <div className="space-y-6">
      {step.instruction && (
        <Banner variant="info" className="flex-col items-start gap-1">
          <span>{step.instruction}</span>
          {step.externalUrl && (
            <a
              href={step.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 hover:text-blue-300"
            >
              Open {(() => {
                try {
                  return new URL(step.externalUrl).hostname;
                } catch {
                  return step.externalUrl;
                }
              })()}
            </a>
          )}
        </Banner>
      )}

      {!hasFields && !step.instruction && (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
            <span className="text-lg text-emerald-500">&#10003;</span>
          </div>
          <p className="text-sm text-muted-foreground">{step.description}</p>
        </div>
      )}

      {hasFields && (
        <div className="space-y-4">
          {step.fields.map((field) =>
            renderField(field, values[field.key] || "", onChange, errors[field.key], botId),
          )}
        </div>
      )}
    </div>
  );
}
