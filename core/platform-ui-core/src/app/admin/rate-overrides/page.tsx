"use client";

import { Plus, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toUserMessage } from "@/lib/errors";
import type { AdapterRateOverride, RateOverrideStatus } from "@/lib/promotions-types";
import { trpcVanilla } from "@/lib/trpc";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ADAPTER_IDS = [
  "nano-banana",
  "elevenlabs",
  "deepgram",
  "openrouter",
  "replicate",
  "gemini",
] as const;

const STATUS_COLORS: Record<RateOverrideStatus, string> = {
  active: "bg-terminal/15 text-terminal border border-terminal/20",
  scheduled: "bg-blue-500/15 text-blue-400 border border-blue-500/20",
  expired: "bg-secondary text-muted-foreground border border-border",
  cancelled: "bg-destructive/15 text-red-400 border border-destructive/20",
};

function formatWindow(startsAt: string, endsAt: string | null): string {
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (!endsAt) return `${fmt(startsAt)} — no end`;
  return `${fmt(startsAt)} — ${fmt(endsAt)}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RateOverridesPage() {
  const [overrides, setOverrides] = useState<AdapterRateOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Create form state
  const [formAdapter, setFormAdapter] = useState<string>(ADAPTER_IDS[0] ?? "");
  const [formName, setFormName] = useState("");
  const [formDiscount, setFormDiscount] = useState(0);
  const [formStartsAt, setFormStartsAt] = useState("");
  const [formEndsAt, setFormEndsAt] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const result = await trpcVanilla.rateOverrides.list.query({});
      if (signal?.aborted) return;
      setOverrides(result as AdapterRateOverride[]);
    } catch {
      // keep state
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function handleCancel(id: string) {
    setCancelError(null);
    try {
      await trpcVanilla.rateOverrides.cancel.mutate({ id });
      await load();
    } catch (err) {
      setCancelError(toUserMessage(err, "Failed to cancel override"));
    }
  }

  async function handleCreate() {
    setCreating(true);
    setFormError(null);
    try {
      await trpcVanilla.rateOverrides.create.mutate({
        adapterId: formAdapter,
        name: formName,
        discountPercent: formDiscount,
        startsAt: new Date(formStartsAt).toISOString(),
        endsAt: formEndsAt ? new Date(formEndsAt).toISOString() : undefined,
        notes: formNotes || undefined,
      });
      setSheetOpen(false);
      setFormName("");
      setFormDiscount(0);
      setFormStartsAt("");
      setFormEndsAt("");
      setFormNotes("");
      await load();
    } catch (err) {
      setFormError(toUserMessage(err, "Failed to create override"));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Rate Overrides</h1>
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1.5" />
              New Override
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Create Rate Override</SheetTitle>
            </SheetHeader>
            <div className="space-y-4 mt-6">
              <div>
                <Label htmlFor="ro-adapter">Adapter</Label>
                <Select value={formAdapter} onValueChange={setFormAdapter}>
                  <SelectTrigger id="ro-adapter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ADAPTER_IDS.map((aid) => (
                      <SelectItem key={aid} value={aid}>
                        {aid}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="ro-name">Name</Label>
                <Input
                  id="ro-name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Holiday discount"
                />
              </div>
              <div>
                <Label htmlFor="ro-discount">Discount %</Label>
                <Input
                  id="ro-discount"
                  type="number"
                  min={0}
                  max={100}
                  value={formDiscount}
                  onChange={(e) => setFormDiscount(Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  100% = free for users — platform absorbs full cost
                </p>
              </div>
              <div>
                <Label htmlFor="ro-starts">Starts At</Label>
                <Input
                  id="ro-starts"
                  type="datetime-local"
                  value={formStartsAt}
                  onChange={(e) => setFormStartsAt(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="ro-ends">Ends At (optional)</Label>
                <Input
                  id="ro-ends"
                  type="datetime-local"
                  value={formEndsAt}
                  onChange={(e) => setFormEndsAt(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="ro-notes">Notes</Label>
                <Textarea
                  id="ro-notes"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  rows={2}
                />
              </div>
              {formError && <p className="text-sm text-destructive">{formError}</p>}
              <Button
                onClick={handleCreate}
                disabled={creating || !formName || !formStartsAt}
                className="w-full"
              >
                {creating ? "Creating..." : "Create Override"}
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Cancel error */}
      {cancelError && <p className="text-sm text-destructive">{cancelError}</p>}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, i) => `ro-sk-${i}`).map((skId) => (
            <Skeleton key={skId} className="h-12 w-full" />
          ))}
        </div>
      ) : overrides.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          No rate overrides found.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Adapter</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="text-right">Discount %</TableHead>
              <TableHead>Window</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created By</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {overrides.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-mono text-xs">{o.adapterId}</TableCell>
                <TableCell className="font-medium">{o.name}</TableCell>
                <TableCell className="text-right tabular-nums">{o.discountPercent}%</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatWindow(o.startsAt, o.endsAt)}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className={cn("text-xs", STATUS_COLORS[o.status])}>
                    {o.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {o.createdBy ?? "—"}
                </TableCell>
                <TableCell>
                  {o.status !== "cancelled" && o.status !== "expired" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      onClick={() => handleCancel(o.id)}
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
