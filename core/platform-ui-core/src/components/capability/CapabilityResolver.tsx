"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCapabilityMeta } from "@/hooks/use-capability-meta";
import { brandName } from "@/lib/brand-config";

/**
 * Renders a capability label from the registry. Falls back to auto-formatted name.
 */
export function CapabilityLabel({ capability }: { capability: string }) {
  const { getMeta } = useCapabilityMeta();
  const meta = getMeta(capability);
  return <span>{meta.label}</span>;
}

/**
 * Renders the pricing badge for a capability. Returns null if no pricing info.
 */
export function CapabilityPricing({ capability }: { capability: string }) {
  const { getMeta } = useCapabilityMeta();
  const meta = getMeta(capability);
  if (!meta.pricing) return null;
  return <Badge variant="outline">{meta.pricing}</Badge>;
}

/**
 * Renders the description for a capability. Returns null if no description.
 */
export function CapabilityDescription({ capability }: { capability: string }) {
  const { getMeta } = useCapabilityMeta();
  const meta = getMeta(capability);
  if (!meta.description) return null;
  return <p className="text-sm text-muted-foreground">{meta.description}</p>;
}

/**
 * Generic provider picker for capabilities. Given a list of capability strings,
 * renders hosted-vs-BYOK choice cards for each capability that has a hostedProvider
 * in the capability registry. Capabilities without a hostedProvider are omitted
 * (they are BYOK-only, no choice needed).
 *
 * Drop-in replacement for the old hardcoded ProviderSelector in install-wizard.
 */
export function CapabilityProviderPicker({
  capabilities,
  choices,
  onChoose,
}: {
  capabilities: string[];
  choices: Record<string, "byok" | "hosted">;
  onChoose: (capability: string, choice: "byok" | "hosted") => void;
}) {
  const { meta } = useCapabilityMeta();

  const hostedCapabilities = capabilities
    .map((cap) => meta.find((m) => m.capability === cap))
    .filter((m): m is NonNullable<typeof m> => !!m && !!m.hostedProvider);

  if (hostedCapabilities.length === 0) {
    return (
      <div className="py-4 text-center">
        <p className="text-sm text-muted-foreground">
          No hosted provider options available for this plugin's capabilities.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Some capabilities can be provided by {brandName()} Hosted services. Choose for each:
      </p>
      {hostedCapabilities.map((capMeta) => {
        const choice = choices[capMeta.capability] ?? "hosted";
        return (
          <div key={capMeta.capability} className="rounded-sm border p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{capMeta.label}</p>
                <p className="text-xs text-muted-foreground">{capMeta.description}</p>
              </div>
              {capMeta.pricing && (
                <Badge variant="outline" className="text-[10px]">
                  {capMeta.pricing}
                </Badge>
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <Button
                data-onboarding-id={`marketplace.wizard.provider.hosted.${capMeta.capability}`}
                variant={choice === "hosted" ? "default" : "outline"}
                size="sm"
                onClick={() => onChoose(capMeta.capability, "hosted")}
              >
                {brandName()} Hosted
              </Button>
              <Button
                data-onboarding-id={`marketplace.wizard.provider.byok.${capMeta.capability}`}
                variant={choice === "byok" ? "default" : "outline"}
                size="sm"
                onClick={() => onChoose(capMeta.capability, "byok")}
              >
                Use your key
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
