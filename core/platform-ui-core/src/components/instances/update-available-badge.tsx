"use client";

import { ArrowUpCircle, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { pullImageUpdate } from "@/lib/api";
import { toUserMessage } from "@/lib/errors";

interface ChangelogSection {
  title: string;
  items: string[];
}

interface Changelog {
  version: string;
  date: string;
  sections: ChangelogSection[];
}

interface UpdateAvailableBadgeProps {
  instanceId: string;
  instanceName: string;
  changelog?: Changelog | null;
  onUpdated?: () => void;
}

export function UpdateAvailableBadge({
  instanceId,
  instanceName,
  changelog,
  onUpdated,
}: UpdateAvailableBadgeProps) {
  const [pulling, setPulling] = useState(false);

  async function handleUpdate() {
    setPulling(true);
    try {
      await pullImageUpdate(instanceId);
      toast.success(`${instanceName} is updating...`);
      onUpdated?.();
    } catch (err) {
      toast.error(toUserMessage(err));
    } finally {
      setPulling(false);
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Badge
          variant="outline"
          className="cursor-pointer gap-1 border-amber-500/30 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 transition-colors"
        >
          <ArrowUpCircle className="h-3 w-3" />
          Update
        </Badge>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Update Available for {instanceName}</AlertDialogTitle>
          <AlertDialogDescription>
            A new version is ready. This will pull the latest image and restart the instance.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {changelog && changelog.sections.length > 0 && (
          <div className="max-h-64 overflow-y-auto rounded-md border border-border bg-muted/30 p-4 text-sm">
            <p className="mb-2 font-medium text-foreground">What&apos;s new ({changelog.date})</p>
            {changelog.sections.map((section) => (
              <div key={section.title} className="mb-3 last:mb-0">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {section.title}
                </p>
                <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>Later</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleUpdate}
            disabled={pulling}
            className="bg-amber-600 hover:bg-amber-700"
          >
            {pulling ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Updating...
              </>
            ) : (
              "Update Now"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
