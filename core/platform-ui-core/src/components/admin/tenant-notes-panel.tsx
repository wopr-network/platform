"use client";

import { Plus, StickyNote } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { AdminNote } from "@/lib/admin-api";
import { addTenantNote, getTenantNotes } from "@/lib/admin-api";
import { toUserMessage } from "@/lib/errors";

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(ts).toLocaleDateString();
}

interface TenantNotesPanelProps {
  tenantId: string;
}

export function TenantNotesPanel({ tenantId }: TenantNotesPanelProps) {
  const [notes, setNotes] = useState<AdminNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getTenantNotes(tenantId);
      setNotes(result);
    } catch (err) {
      toast.error(toUserMessage(err));
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAdd() {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      const note = await addTenantNote(tenantId, draft.trim());
      setNotes((prev) => [note, ...prev]);
      setDraft("");
      setAdding(false);
      toast.success("Note added.");
    } catch (err) {
      toast.error(toUserMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <StickyNote className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Admin Notes</h3>
          {!loading && <span className="text-xs text-muted-foreground">({notes.length})</span>}
        </div>
        <Button size="sm" variant="ghost" onClick={() => setAdding((v) => !v)} className="h-7 px-2">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {adding && (
        <div className="border-b border-border p-3 space-y-2 bg-muted/10">
          <Textarea
            placeholder="Write a note…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            className="text-sm"
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setAdding(false);
                setDraft("");
              }}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={handleAdd} disabled={saving || !draft.trim()}>
              {saving ? "Saving…" : "Add Note"}
            </Button>
          </div>
        </div>
      )}

      <div className="divide-y divide-border max-h-72 overflow-y-auto">
        {loading ? (
          Array.from({ length: 3 }, (_, i) => `sk-note-${i}`).map((k) => (
            <div key={k} className="px-4 py-3 space-y-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))
        ) : notes.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">No notes yet.</p>
        ) : (
          notes.map((note) => (
            <div key={note.id} className="px-4 py-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">{note.admin_user}</span>
                <span className="text-xs text-muted-foreground">
                  {relativeTime(note.created_at)}
                </span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{note.content}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
