"use client";

import { InstanceDetailClient } from "@core/app/instances/[id]/instance-detail-client";
import { Card, CardContent, CardHeader, CardTitle } from "@core/components/ui/card";
import { Input } from "@core/components/ui/input";
import { toUserMessage } from "@core/lib/errors";
import { DollarSign, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { updateInstanceBudget } from "@/lib/nemoclaw-api";

export function NemoClawInstanceDetail({ instanceId }: { instanceId: string }) {
  return (
    <div className="space-y-6">
      <InstanceDetailClient instanceId={instanceId} />
      <BudgetSection instanceId={instanceId} />
    </div>
  );
}

function BudgetSection({ instanceId }: { instanceId: string }) {
  const [budgetDollars, setBudgetDollars] = useState("");
  const [perAgentDollars, setPerAgentDollars] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const budget = Number.parseFloat(budgetDollars);
    if (Number.isNaN(budget) || budget < 0) {
      toast.error("Enter a valid budget amount");
      return;
    }
    const perAgent = perAgentDollars ? Number.parseFloat(perAgentDollars) : undefined;
    if (perAgent !== undefined && (Number.isNaN(perAgent) || perAgent < 0)) {
      toast.error("Enter a valid per-agent limit");
      return;
    }

    setSaving(true);
    try {
      await updateInstanceBudget(
        instanceId,
        Math.round(budget * 100),
        perAgent !== undefined ? Math.round(perAgent * 100) : undefined,
      );
      toast.success("Budget updated");
    } catch (err: unknown) {
      toast.error(toUserMessage(err, "Failed to update budget"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-indigo-500/10">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <DollarSign className="size-4 text-indigo-400" />
          Spending Budget
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="budget" className="font-mono text-xs text-muted-foreground/60 mb-1 block">
              Monthly budget ($)
            </label>
            <Input
              id="budget"
              type="number"
              min="0"
              step="0.01"
              placeholder="50.00"
              value={budgetDollars}
              onChange={(e) => setBudgetDollars(e.target.value)}
              className="font-mono text-sm"
            />
          </div>
          <div>
            <label htmlFor="per-agent" className="font-mono text-xs text-muted-foreground/60 mb-1 block">
              Per-agent limit ($, optional)
            </label>
            <Input
              id="per-agent"
              type="number"
              min="0"
              step="0.01"
              placeholder="10.00"
              value={perAgentDollars}
              onChange={(e) => setPerAgentDollars(e.target.value)}
              className="font-mono text-sm"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !budgetDollars}
          className="inline-flex items-center gap-2 rounded-md bg-indigo-500/10 px-4 py-2 font-mono text-xs text-indigo-400 hover:bg-indigo-500/20 disabled:opacity-40 transition-colors duration-200"
        >
          {saving && <Loader2 className="size-3 animate-spin" />}
          {saving ? "Saving..." : "Update Budget"}
        </button>
      </CardContent>
    </Card>
  );
}
