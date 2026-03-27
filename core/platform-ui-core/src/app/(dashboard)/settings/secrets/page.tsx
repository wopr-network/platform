"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckIcon, CopyIcon, HistoryIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  createSecret,
  deleteSecret,
  fetchSecretAudit,
  listSecrets,
  rotateSecret,
  type SecretAuditEntry,
  type SecretSummary,
} from "@/lib/api";

function formatDate(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function isExpiringSoon(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  const diff = new Date(expiresAt).getTime() - Date.now();
  return diff > 0 && diff < 7 * 24 * 60 * 60 * 1000;
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

export default function SecretsPage() {
  const [secrets, setSecrets] = useState<SecretSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealedValue, setRevealedValue] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [expandedAudit, setExpandedAudit] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await listSecrets();
      setSecrets(data);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(id: string) {
    setSecrets((prev) => prev.filter((s) => s.id !== id));
    try {
      await deleteSecret(id);
      setError(null);
    } catch {
      await load();
      setError("Failed to delete secret. Please try again.");
    }
  }

  async function handleRotate(id: string) {
    try {
      const { plaintextValue } = await rotateSecret(id);
      setRevealedValue(plaintextValue);
      setError(null);
      load();
    } catch {
      setError("Failed to rotate secret. Please try again.");
    }
  }

  async function handleCopy() {
    if (revealedValue) {
      try {
        await navigator.clipboard.writeText(revealedValue);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Clipboard write may fail in some browser contexts
      }
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Secrets Vault</h1>
          <p className="text-sm text-muted-foreground">
            Manage encrypted credentials for plugins and integrations
          </p>
        </div>
        <CreateSecretDialog
          onCreated={(plaintextValue) => {
            setRevealedValue(plaintextValue);
            load();
          }}
        />
      </div>

      <AnimatePresence>
        {revealedValue && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Card className="border-terminal/50 bg-terminal/5">
              <CardContent className="pt-6">
                <p className="mb-2 text-sm font-medium">
                  Your new secret has been created. Copy it now -- it will not be shown again.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded bg-muted px-3 py-2 text-sm font-mono break-all">
                    {revealedValue}
                  </code>
                  <Tooltip open={copied}>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="sm" onClick={handleCopy}>
                        {copied ? (
                          <CheckIcon className="size-4" />
                        ) : (
                          <CopyIcon className="size-4" />
                        )}
                        {copied ? "Copied" : "Copy"}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Copied!</TooltipContent>
                  </Tooltip>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={() => setRevealedValue(null)}
                >
                  Dismiss
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {loadError ? (
        <div className="flex h-40 flex-col items-center justify-center gap-3 text-muted-foreground">
          <p className="text-sm text-destructive">Failed to load secrets.</p>
          <Button variant="outline" size="sm" onClick={load}>
            Retry
          </Button>
        </div>
      ) : loading ? (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last Used</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="w-[120px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 3 }, (_, n) => `sk-${n}`).map((skId) => (
                <TableRow key={skId}>
                  <TableCell>
                    <Skeleton className="h-4 w-28" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-7 w-20" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : secrets.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
          <p className="text-sm">No secrets yet. Add one to get started.</p>
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last Used</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="w-[120px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {secrets.map((secret) => (
                <SecretRow
                  key={secret.id}
                  secret={secret}
                  isAuditExpanded={expandedAudit === secret.id}
                  onToggleAudit={() =>
                    setExpandedAudit(expandedAudit === secret.id ? null : secret.id)
                  }
                  onRotate={() => handleRotate(secret.id)}
                  onDelete={() => handleDelete(secret.id)}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function SecretRow({
  secret,
  isAuditExpanded,
  onToggleAudit,
  onRotate,
  onDelete,
}: {
  secret: SecretSummary;
  isAuditExpanded: boolean;
  onToggleAudit: () => void;
  onRotate: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <TableRow className="hover:bg-accent/50 transition-colors duration-150">
        <TableCell className="font-medium">{secret.name}</TableCell>
        <TableCell>
          <Badge variant="secondary">{secret.type}</Badge>
        </TableCell>
        <TableCell className="text-muted-foreground">{formatDate(secret.createdAt)}</TableCell>
        <TableCell className="text-muted-foreground">{formatDate(secret.lastUsedAt)}</TableCell>
        <TableCell
          className={
            isExpired(secret.expiresAt)
              ? "text-destructive"
              : isExpiringSoon(secret.expiresAt)
                ? "text-chart-3"
                : "text-muted-foreground"
          }
        >
          {formatDate(secret.expiresAt)}
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Access log"
                  onClick={onToggleAudit}
                >
                  <HistoryIcon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Access log</TooltipContent>
            </Tooltip>
            <RotateDialog secretName={secret.name} onRotate={onRotate} />
            <DeleteSecretDialog secretName={secret.name} onDelete={onDelete} />
          </div>
        </TableCell>
      </TableRow>
      <AnimatePresence>
        {isAuditExpanded && (
          <tr>
            <td colSpan={6} className="p-0">
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <AuditPanel secretId={secret.id} />
              </motion.div>
            </td>
          </tr>
        )}
      </AnimatePresence>
    </>
  );
}

function AuditPanel({ secretId }: { secretId: string }) {
  const [entries, setEntries] = useState<SecretAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [visibleCount, setVisibleCount] = useState(10);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setUnavailable(false);
    setVisibleCount(10);
    fetchSecretAudit(secretId)
      .then((data) => {
        if (!cancelled) setEntries(data);
      })
      .catch(() => {
        if (!cancelled) setUnavailable(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [secretId]);

  const visibleEntries = entries.slice(0, visibleCount);
  const remaining = entries.length - visibleCount;

  return (
    <div className="px-4 py-3 space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Access Log
      </p>
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, i) => `audit-sk-${i}`).map((id) => (
            <Skeleton key={id} className="h-4 w-full" />
          ))}
        </div>
      ) : unavailable ? (
        <p className="py-4 text-center text-xs text-muted-foreground">
          Audit log not available yet.
        </p>
      ) : entries.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">No access recorded yet.</p>
      ) : (
        <>
          {visibleEntries.map((entry) => (
            <div key={entry.id} className="flex items-center gap-3 py-1.5 text-xs">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="w-24 shrink-0 text-muted-foreground cursor-default">
                    {formatRelativeTime(entry.timestamp)}
                  </span>
                </TooltipTrigger>
                <TooltipContent>{new Date(entry.timestamp).toLocaleString()}</TooltipContent>
              </Tooltip>
              <span className="font-medium">{entry.actorName}</span>
              <Badge variant="secondary" className="text-xs">
                {entry.action}
              </Badge>
            </div>
          ))}
          {remaining > 0 && (
            <div className="pt-1 text-center">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground"
                onClick={() => setVisibleCount((c) => Math.min(c + 10, entries.length))}
              >
                Load {Math.min(remaining, 10)} more
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CreateSecretDialog({ onCreated }: { onCreated: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [type, setType] = useState("api-token");
  const [expiration, setExpiration] = useState("never");
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    try {
      const result = await createSecret({
        name,
        value,
        type,
        ...(expiration !== "never" ? { expiresIn: expiration } : {}),
      });
      setName("");
      setValue("");
      setType("api-token");
      setExpiration("never");
      setOpen(false);
      onCreated(result.plaintextValue);
    } catch {
      setSubmitError("Failed to create secret. Please try again.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) setSubmitError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="terminal">Add secret</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Secret</DialogTitle>
          <DialogDescription>
            Create a new encrypted credential. The value will only be shown once after creation.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="secret-name">Name</Label>
            <Input
              id="secret-name"
              placeholder="e.g. Stripe Webhook Signing Key"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="secret-value">Value</Label>
            <Input
              id="secret-value"
              type="password"
              placeholder="Paste your secret value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="secret-type">Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="secret-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="api-token">API Token</SelectItem>
                <SelectItem value="webhook-signing">Webhook Signing Key</SelectItem>
                <SelectItem value="service-credential">Service Credential</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="secret-expiration">Expiration</Label>
            <Select value={expiration} onValueChange={setExpiration}>
              <SelectTrigger id="secret-expiration" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
                <SelectItem value="365">1 year</SelectItem>
                <SelectItem value="never">Never</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {submitError && <p className="text-sm text-destructive">{submitError}</p>}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit">Store secret</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RotateDialog({ secretName, onRotate }: { secretName: string; onRotate: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon-sm">
              <RefreshCwIcon className="size-4" />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>Rotate</TooltipContent>
      </Tooltip>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rotate Secret</DialogTitle>
          <DialogDescription>
            Generate a new value for <strong>{secretName}</strong>. The current value will be
            immediately invalidated.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-sm border border-chart-3/20 bg-chart-3/10 px-3 py-2 text-sm text-chart-3">
          Any systems using the current value will lose access immediately.
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            variant="terminal"
            onClick={() => {
              onRotate();
              setOpen(false);
            }}
          >
            Rotate value
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteSecretDialog({
  secretName,
  onDelete,
}: {
  secretName: string;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="text-destructive">
              <Trash2Icon className="size-4" />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>Delete</TooltipContent>
      </Tooltip>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Secret</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete <strong>{secretName}</strong>? This action cannot be
            undone.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-sm border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Any plugins or bots that depend on this secret will lose access immediately.
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            variant="destructive"
            onClick={() => {
              onDelete();
              setOpen(false);
            }}
          >
            Delete secret
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
