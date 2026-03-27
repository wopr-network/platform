"use client";

import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  FileCode,
  GitBranch,
  MessageSquare,
  ShieldCheck,
  User,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getChangeset } from "@/lib/changeset-api";
import type {
  ChangesetDetail,
  ChangesetFile,
  ChangesetReviewStatus,
  ChangesetStatus,
} from "@/lib/changeset-types";
import { toUserMessage } from "@/lib/errors";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
 * Helper sub-components (internal only)
 * ------------------------------------------------------------------------- */

function ChangesetStatusBadge({ status }: { status: ChangesetStatus }) {
  const variants: Record<ChangesetStatus, string> = {
    open: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    merged: "border-purple-500/30 bg-purple-500/10 text-purple-400",
    closed: "border-red-500/30 bg-red-500/10 text-red-400",
  };
  return (
    <Badge variant="outline" className={cn("capitalize", variants[status])}>
      {status}
    </Badge>
  );
}

function ReviewStatusBadge({ status }: { status: ChangesetReviewStatus }) {
  const variants: Record<ChangesetReviewStatus, string> = {
    pending: "border-yellow-500/30 bg-yellow-500/10 text-yellow-400",
    approved: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    rejected: "border-red-500/30 bg-red-500/10 text-red-400",
    changes_requested: "border-orange-500/30 bg-orange-500/10 text-orange-400",
  };
  const labels: Record<ChangesetReviewStatus, string> = {
    pending: "Pending",
    approved: "Approved",
    rejected: "Rejected",
    changes_requested: "Changes Requested",
  };
  return (
    <Badge variant="outline" className={cn(variants[status])}>
      {labels[status]}
    </Badge>
  );
}

function FileStatusBadge({ status }: { status: ChangesetFile["status"] }) {
  const config: Record<ChangesetFile["status"], { label: string; className: string }> = {
    added: { label: "A", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" },
    modified: { label: "M", className: "border-blue-500/30 bg-blue-500/10 text-blue-400" },
    deleted: { label: "D", className: "border-red-500/30 bg-red-500/10 text-red-400" },
    renamed: { label: "R", className: "border-yellow-500/30 bg-yellow-500/10 text-yellow-400" },
  };
  const { label, className } = config[status];
  return (
    <Badge variant="outline" className={cn("font-mono text-xs", className)}>
      {label}
    </Badge>
  );
}

function DiffBlock({ patch }: { patch: string }) {
  const lines = patch.split("\n");
  return (
    <pre className="overflow-x-auto rounded-md bg-muted/50 p-3 font-mono text-xs leading-relaxed">
      {lines.map((line, idx) => {
        let lineClass = "text-muted-foreground";
        if (line.startsWith("@@")) {
          lineClass = "text-blue-400";
        } else if (line.startsWith("+++") || line.startsWith("---")) {
          lineClass = "text-muted-foreground";
        } else if (line.startsWith("+")) {
          lineClass = "text-emerald-400 bg-emerald-500/10";
        } else if (line.startsWith("-")) {
          lineClass = "text-red-400 bg-red-500/10";
        }
        return (
          <div key={`${idx}-${line.slice(0, 20)}`} className={lineClass}>
            {line}
          </div>
        );
      })}
    </pre>
  );
}

/* ---------------------------------------------------------------------------
 * Main component
 * ------------------------------------------------------------------------- */

export function ChangesetDetailClient({ changesetId }: { changesetId: string }) {
  const [changeset, setChangeset] = useState<ChangesetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getChangeset(changesetId);
      setChangeset(data);
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setLoading(false);
    }
  }, [changesetId]);

  useEffect(() => {
    load();
  }, [load]);

  /* --- Loading state --- */
  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-24" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-64" />
          <div className="flex gap-2">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-20" />
          </div>
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-9 w-64" />
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, n) => `sk-${n}`).map((skId) => (
            <Skeleton key={skId} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  /* --- Error state --- */
  if (error) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/changesets">
            <ArrowLeft className="mr-2 size-4" />
            Back
          </Link>
        </Button>
        <Card>
          <CardContent className="py-8 text-center">
            <p className="mb-4 text-sm text-destructive">{error}</p>
            <Button variant="outline" onClick={load}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!changeset) return null;

  /* --- Loaded state --- */
  return (
    <div className="space-y-6">
      {/* Header */}
      <Button variant="ghost" size="sm" asChild>
        <Link href="/changesets">
          <ArrowLeft className="mr-2 size-4" />
          Back
        </Link>
      </Button>

      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">{changeset.title}</h1>
        <div className="flex items-center gap-2">
          <ChangesetStatusBadge status={changeset.status} />
          <ReviewStatusBadge status={changeset.reviewStatus} />
        </div>
        {changeset.description && (
          <p className="text-sm text-muted-foreground">{changeset.description}</p>
        )}
      </div>

      {/* Metadata */}
      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1">
          <User className="size-3.5" />
          {changeset.author}
        </span>
        <span className="flex items-center gap-1">
          <GitBranch className="size-3.5" />
          {changeset.sourceBranch} → {changeset.targetBranch}
        </span>
        <span>Created {formatRelativeTime(changeset.createdAt)}</span>
        <span>Updated {formatRelativeTime(changeset.updatedAt)}</span>
        {changeset.mergedAt && <span>Merged {formatRelativeTime(changeset.mergedAt)}</span>}
      </div>

      <Separator />

      {/* Tabs */}
      <Tabs defaultValue="files">
        <TabsList>
          <TabsTrigger value="files" className="gap-1.5">
            <FileCode className="size-3.5" />
            Files
            <Badge variant="secondary" className="ml-1 text-xs">
              {changeset.files.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="reviews" className="gap-1.5">
            <ShieldCheck className="size-3.5" />
            Reviews
            <Badge variant="secondary" className="ml-1 text-xs">
              {changeset.reviews.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="comments" className="gap-1.5">
            <MessageSquare className="size-3.5" />
            Comments
            <Badge variant="secondary" className="ml-1 text-xs">
              {changeset.comments.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* Files tab */}
        <TabsContent value="files" className="space-y-4">
          <Card>
            <CardContent className="flex items-center gap-6 py-3">
              <span className="text-sm text-muted-foreground">
                {changeset.files.length} file{changeset.files.length !== 1 ? "s" : ""} changed
              </span>
              <span className="text-sm font-mono text-emerald-400">
                +{changeset.totalAdditions}
              </span>
              <span className="text-sm font-mono text-red-400">-{changeset.totalDeletions}</span>
            </CardContent>
          </Card>

          {changeset.files.map((file) => (
            <FileCard key={file.path} file={file} />
          ))}
        </TabsContent>

        {/* Reviews tab */}
        <TabsContent value="reviews" className="space-y-4">
          {changeset.reviews.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No reviews yet.
              </CardContent>
            </Card>
          ) : (
            changeset.reviews.map((review) => (
              <Card key={review.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <User className="size-3.5 text-muted-foreground" />
                      <span className="text-sm font-medium">{review.author}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <ReviewStatusBadge status={review.status} />
                      <span className="text-xs text-muted-foreground">
                        {formatRelativeTime(review.createdAt)}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                {review.body && (
                  <CardContent className="pt-0">
                    <p className="text-sm text-muted-foreground">{review.body}</p>
                  </CardContent>
                )}
              </Card>
            ))
          )}
        </TabsContent>

        {/* Comments tab */}
        <TabsContent value="comments" className="space-y-4">
          {changeset.comments.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No comments yet.
              </CardContent>
            </Card>
          ) : (
            changeset.comments.map((comment) => (
              <Card key={comment.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <User className="size-3.5 text-muted-foreground" />
                      <span className="text-sm font-medium">{comment.author}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeTime(comment.createdAt)}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm">{comment.body}</p>
                  {comment.filePath && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {comment.filePath}
                      {comment.lineNumber != null && `:${comment.lineNumber}`}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * File card with collapsible diff
 * ------------------------------------------------------------------------- */

function FileCard({ file }: { file: ChangesetFile }) {
  const [open, setOpen] = useState(false);
  const hasDiff = file.patch != null;

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild disabled={!hasDiff}>
          <button
            type="button"
            className={cn(
              "flex w-full items-center justify-between px-4 py-3 text-left text-sm",
              hasDiff && "cursor-pointer hover:bg-muted/50",
            )}
          >
            <div className="flex items-center gap-2">
              {hasDiff ? (
                open ? (
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="size-3.5 text-muted-foreground" />
                )
              ) : (
                <span className="size-3.5" />
              )}
              <FileStatusBadge status={file.status} />
              <span className="font-mono text-sm">
                {file.status === "renamed" && file.previousPath
                  ? `${file.previousPath} → ${file.path}`
                  : file.path}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs text-emerald-400">+{file.additions}</span>
              <span className="font-mono text-xs text-red-400">-{file.deletions}</span>
            </div>
          </button>
        </CollapsibleTrigger>
        {hasDiff && (
          <CollapsibleContent>
            <Separator />
            <div className="p-4">
              <DiffBlock patch={file.patch as string} />
            </div>
          </CollapsibleContent>
        )}
        {!hasDiff && (
          <div className="border-t px-4 py-2">
            <span className="text-xs text-muted-foreground">No diff available</span>
          </div>
        )}
      </Collapsible>
    </Card>
  );
}
