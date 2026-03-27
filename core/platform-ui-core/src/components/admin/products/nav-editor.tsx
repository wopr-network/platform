"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toUserMessage } from "@/lib/errors";

interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: string | null;
  sortOrder: number;
  requiresRole: string | null;
  enabled: boolean;
}

interface NavEditorProps {
  initial: NavItem[];
  onSave: (endpoint: string, data: unknown) => Promise<void>;
}

function newItem(sortOrder: number): NavItem {
  return {
    id: crypto.randomUUID(),
    label: "",
    href: "",
    icon: null,
    sortOrder,
    requiresRole: null,
    enabled: true,
  };
}

export function NavEditor({ initial, onSave }: NavEditorProps) {
  const [items, setItems] = useState<NavItem[]>(
    [...initial].sort((a, b) => a.sortOrder - b.sortOrder),
  );
  const [saving, setSaving] = useState(false);

  function update(id: string, patch: Partial<NavItem>) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function remove(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  function move(index: number, direction: "up" | "down") {
    setItems((prev) => {
      const next = [...prev];
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((item, i) => ({ ...item, sortOrder: i }));
    });
  }

  function addItem() {
    setItems((prev) => [...prev, newItem(prev.length)]);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const normalized = items.map((item, i) => ({ ...item, sortOrder: i }));
      await onSave("updateNavItems", normalized);
      toast.success("Navigation saved.");
    } catch (err) {
      toast.error(toUserMessage(err, "Failed to save navigation"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Navigation Items</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground">No navigation items. Add one below.</p>
        )}
        {items.map((item, index) => (
          <div
            key={item.id}
            className="flex items-start gap-3 rounded-md border border-border bg-muted/30 p-3"
          >
            <div className="flex flex-col gap-1 pt-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => move(index, "up")}
                disabled={index === 0}
              >
                <ArrowUp className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => move(index, "down")}
                disabled={index === items.length - 1}
              >
                <ArrowDown className="h-3 w-3" />
              </Button>
            </div>
            <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Label</Label>
                <Input
                  value={item.label}
                  onChange={(e) => update(item.id, { label: e.target.value })}
                  placeholder="Dashboard"
                  className="h-8"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Href</Label>
                <Input
                  value={item.href}
                  onChange={(e) => update(item.id, { href: e.target.value })}
                  placeholder="/dashboard"
                  className="h-8"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Icon</Label>
                <Input
                  value={item.icon ?? ""}
                  onChange={(e) => update(item.id, { icon: e.target.value || null })}
                  placeholder="LayoutDashboard"
                  className="h-8"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Requires Role</Label>
                <Input
                  value={item.requiresRole ?? ""}
                  onChange={(e) => update(item.id, { requiresRole: e.target.value || null })}
                  placeholder="platform_admin"
                  className="h-8"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-5">
              <Checkbox
                id={`nav-enabled-${item.id}`}
                checked={item.enabled}
                onCheckedChange={(checked) => update(item.id, { enabled: Boolean(checked) })}
              />
              <Label htmlFor={`nav-enabled-${item.id}`} className="text-xs">
                Enabled
              </Label>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-4 h-7 w-7 p-0 text-destructive hover:text-destructive"
              onClick={() => remove(item.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <div className="flex items-center justify-between pt-2">
          <Button variant="outline" size="sm" onClick={addItem}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add Item
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Navigation"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
