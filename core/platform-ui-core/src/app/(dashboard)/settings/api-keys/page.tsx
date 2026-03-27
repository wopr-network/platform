"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckIcon, CopyIcon } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
  createApiKey,
  type Instance,
  listApiKeys,
  listInstances,
  type PlatformApiKey,
  revokeApiKey,
} from "@/lib/api";

function formatDate(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<PlatformApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await listApiKeys();
      setKeys(data);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRevoke(id: string) {
    setKeys((prev) => prev.filter((k) => k.id !== id));
    try {
      await revokeApiKey(id);
    } catch {
      setError("Failed to revoke API key. Please try again.");
      try {
        const refreshed = await listApiKeys();
        setKeys(refreshed);
      } catch {
        // silently ignore refresh failure — we already showed the revoke error
      }
    }
  }

  async function handleCopy() {
    if (newSecret) {
      try {
        await navigator.clipboard.writeText(newSecret);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Clipboard write may fail in some browser contexts
      }
    }
  }

  if (loadError) {
    return (
      <div className="max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">API Keys</h1>
          <p className="text-sm text-muted-foreground">
            Generate and manage platform API keys for programmatic access
          </p>
        </div>
        <div className="flex h-40 flex-col items-center justify-center gap-3 text-muted-foreground">
          <p className="text-sm text-destructive">Failed to load API keys.</p>
          <Button variant="outline" size="sm" onClick={load}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">API Keys</h1>
          <p className="text-sm text-muted-foreground">
            Generate and manage platform API keys for programmatic access
          </p>
        </div>
        <CreateKeyDialog
          onCreated={(secret) => {
            setNewSecret(secret);
            load();
          }}
        />
      </div>

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

      <AnimatePresence>
        {newSecret && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Card className="border-terminal/50 bg-terminal/5">
              <CardContent className="pt-6">
                <p className="mb-2 text-sm font-medium">
                  Your new API key has been created. Copy it now -- it will not be shown again.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded bg-muted px-3 py-2 text-sm font-mono break-all">
                    {newSecret}
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
                  onClick={() => setNewSecret(null)}
                >
                  Dismiss
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last Used</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 3 }, (_, n) => `sk-${n}`).map((skId) => (
                <TableRow key={skId}>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-14" />
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
                    <Skeleton className="h-7 w-14" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : keys.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          No API keys yet. Create one to get started.
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last Used</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((key) => (
                <TableRow key={key.id}>
                  <TableCell className="font-medium">{key.name}</TableCell>
                  <TableCell>
                    <code className="text-xs font-mono">
                      {key.prefix}
                      <span className="text-muted-foreground">{"*".repeat(12)}</span>
                    </code>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{key.scope}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(key.createdAt)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(key.lastUsedAt)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(key.expiresAt)}
                  </TableCell>
                  <TableCell>
                    <RevokeDialog keyName={key.name} onRevoke={() => handleRevoke(key.id)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function CreateKeyDialog({ onCreated }: { onCreated: (secret: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [scope, setScope] = useState("full");
  const [expiration, setExpiration] = useState("90");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [selectedInstanceIds, setSelectedInstanceIds] = useState<string[]>([]);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [instancesLoading, setInstancesLoading] = useState(false);
  const [instancesError, setInstancesError] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setInstancesLoading(true);
    setInstancesError(false);
    listInstances()
      .then((data) => {
        if (!cancelled) setInstances(data);
      })
      .catch(() => {
        if (!cancelled) setInstancesError(true);
      })
      .finally(() => {
        if (!cancelled) setInstancesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (scope === "instances" && selectedInstanceIds.length === 0) return;
    setSubmitError(null);
    try {
      const { secret } = await createApiKey({
        name,
        scope,
        expiration,
        ...(scope === "instances" ? { instanceIds: selectedInstanceIds } : {}),
      });
      setName("");
      setScope("full");
      setExpiration("90");
      setSelectedInstanceIds([]);
      setOpen(false);
      onCreated(secret);
    } catch {
      setSubmitError("Failed to create API key. Please try again.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) setSubmitError(null);
        if (!v) setSelectedInstanceIds([]);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="terminal">Generate new key</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate API Key</DialogTitle>
          <DialogDescription>
            Create a new API key with specific scope and expiration.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="key-name">Name</Label>
            <Input
              id="key-name"
              placeholder="e.g. CI Pipeline"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="key-scope">Scope</Label>
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger id="key-scope" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="read-only">Read only</SelectItem>
                <SelectItem value="full">Full access</SelectItem>
                <SelectItem value="instances">Specific instances</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <AnimatePresence>
            {scope === "instances" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="flex flex-col gap-2 overflow-hidden"
              >
                <Label>Select instances</Label>
                {instancesLoading ? (
                  <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                    <Skeleton className="h-5 w-full" />
                    <Skeleton className="h-5 w-full" />
                  </div>
                ) : instancesError ? (
                  <p className="text-sm text-destructive">Failed to load instances.</p>
                ) : instances.length === 0 ? (
                  <div className="rounded-md border bg-muted/30 p-3 py-6 text-center">
                    <p className="text-sm text-muted-foreground">
                      No bot instances found. Deploy a bot first.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="max-h-[160px] space-y-1 overflow-y-auto rounded-md border bg-muted/30 p-3">
                      {instances.map((inst) => (
                        <label
                          key={inst.id}
                          htmlFor={`inst-${inst.id}`}
                          className="flex cursor-pointer items-center gap-3 rounded-sm px-2 py-1.5 transition-colors duration-100 hover:bg-muted/50"
                        >
                          <Checkbox
                            id={`inst-${inst.id}`}
                            checked={selectedInstanceIds.includes(inst.id)}
                            onCheckedChange={(checked) => {
                              setSelectedInstanceIds((prev) =>
                                checked ? [...prev, inst.id] : prev.filter((id) => id !== inst.id),
                              );
                            }}
                            className="data-[state=checked]:border-terminal data-[state=checked]:bg-terminal"
                          />
                          <span className="text-sm">{inst.name}</span>
                          <Badge variant="secondary" className="ml-auto font-mono text-xs">
                            {inst.status}
                          </Badge>
                        </label>
                      ))}
                    </div>
                    {selectedInstanceIds.length > 0 && (
                      <p className="text-right text-xs text-terminal">
                        {selectedInstanceIds.length} of {instances.length} selected
                      </p>
                    )}
                    {selectedInstanceIds.length === 0 && (
                      <p className="text-sm text-destructive">Select at least one instance.</p>
                    )}
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
          <div className="flex flex-col gap-2">
            <Label htmlFor="key-expiration">Expiration</Label>
            <Select value={expiration} onValueChange={setExpiration}>
              <SelectTrigger id="key-expiration" className="w-full">
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
            <Button
              type="submit"
              disabled={
                (scope === "instances" && selectedInstanceIds.length === 0) ||
                (scope === "instances" && instances.length === 0) ||
                (scope === "instances" && instancesError)
              }
            >
              Generate key
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RevokeDialog({ keyName, onRevoke }: { keyName: string; onRevoke: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive">
          Revoke
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revoke API Key</DialogTitle>
          <DialogDescription>
            Are you sure you want to revoke <strong>{keyName}</strong>? Any applications using this
            key will immediately lose access.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            variant="destructive"
            onClick={() => {
              onRevoke();
              setOpen(false);
            }}
          >
            Revoke key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
