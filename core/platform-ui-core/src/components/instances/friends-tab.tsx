"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, Plus, Radio, Shield, Trash2, UserPlus, Users, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AutoAcceptConfig, DiscoveredBot, Friend, FriendRequest } from "@/lib/api";
import {
  acceptFriendRequest,
  getAutoAcceptConfig,
  listDiscoveredBots,
  listFriendRequests,
  listFriends,
  rejectFriendRequest,
  removeFriend,
  sendFriendRequest,
  updateAutoAcceptConfig,
  updateFriendCapabilities,
} from "@/lib/api";
import { toUserMessage } from "@/lib/errors";

const cardVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, delay: i * 0.05 },
  }),
};

export function FriendsTab({ instanceId }: { instanceId: string }) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [discovered, setDiscovered] = useState<DiscoveredBot[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [autoAccept, setAutoAccept] = useState<AutoAcceptConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [removingFriend, setRemovingFriend] = useState<string | null>(null);
  const [capRuleInput, setCapRuleInput] = useState("");
  const [maxFriendsInput, setMaxFriendsInput] = useState("");
  const loaded = useRef(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [f, d, r, a] = await Promise.all([
        listFriends(instanceId),
        listDiscoveredBots(instanceId),
        listFriendRequests(instanceId),
        getAutoAcceptConfig(instanceId),
      ]);
      setFriends(f);
      setDiscovered(d);
      setRequests(r);
      setAutoAccept(a);
      if (a.rules.requireCapabilities) {
        setCapRuleInput(a.rules.requireCapabilities.join(", "));
      }
      if (a.rules.maxFriends !== undefined) {
        setMaxFriendsInput(String(a.rules.maxFriends));
      }
    } catch (err) {
      setError(toUserMessage(err, "Failed to load friends data"));
    } finally {
      setLoading(false);
    }
  }, [instanceId]);

  useEffect(() => {
    if (!loaded.current) {
      loaded.current = true;
      loadAll();
    }
  }, [loadAll]);

  async function handleSendRequest(targetBotId: string) {
    setActionError(null);
    setSendingTo(targetBotId);
    try {
      await sendFriendRequest(instanceId, targetBotId);
      await loadAll();
    } catch (err) {
      setActionError(toUserMessage(err, "Failed to send request"));
    } finally {
      setSendingTo(null);
    }
  }

  async function handleAccept(requestId: string) {
    setActionError(null);
    try {
      await acceptFriendRequest(instanceId, requestId);
      await loadAll();
    } catch (err) {
      setActionError(toUserMessage(err, "Failed to accept request"));
    }
  }

  // Used for both inbound rejection and outbound cancellation — the backend uses
  // the same POST /requests/:id/reject endpoint for both operations.
  async function handleReject(requestId: string) {
    setActionError(null);
    try {
      await rejectFriendRequest(instanceId, requestId);
      await loadAll();
    } catch (err) {
      setActionError(toUserMessage(err, "Failed to reject request"));
    }
  }

  async function handleRemoveFriend(friendId: string) {
    setActionError(null);
    setRemovingFriend(friendId);
    try {
      await removeFriend(instanceId, friendId);
      setFriends((prev) => prev.filter((f) => f.id !== friendId));
    } catch (err) {
      setActionError(toUserMessage(err, "Failed to remove friend"));
    } finally {
      setRemovingFriend(null);
    }
  }

  async function handleToggleCapability(friendId: string, current: string[], cap: string) {
    setActionError(null);
    const updated = current.includes(cap) ? current.filter((c) => c !== cap) : [...current, cap];
    // Optimistic update
    setFriends((prev) =>
      prev.map((f) => (f.id === friendId ? { ...f, sharedCapabilities: updated } : f)),
    );
    try {
      await updateFriendCapabilities(instanceId, friendId, updated);
    } catch (err) {
      // Rollback
      setFriends((prev) =>
        prev.map((f) => (f.id === friendId ? { ...f, sharedCapabilities: current } : f)),
      );
      setActionError(toUserMessage(err, "Failed to update capabilities"));
    }
  }

  async function handleToggleAutoAccept() {
    if (!autoAccept) return;
    setActionError(null);
    const updated = { ...autoAccept, enabled: !autoAccept.enabled };
    try {
      await updateAutoAcceptConfig(instanceId, updated);
      setAutoAccept(updated);
    } catch (err) {
      setActionError(toUserMessage(err, "Failed to update auto-accept"));
    }
  }

  async function handleSaveAutoAcceptRules() {
    if (!autoAccept) return;
    setActionError(null);
    const caps = capRuleInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const maxF = maxFriendsInput ? Number.parseInt(maxFriendsInput, 10) : undefined;
    const updated: AutoAcceptConfig = {
      ...autoAccept,
      rules: {
        requireCapabilities: caps.length > 0 ? caps : undefined,
        maxFriends: maxF && !Number.isNaN(maxF) ? maxF : undefined,
      },
    };
    try {
      await updateAutoAcceptConfig(instanceId, updated);
      setAutoAccept(updated);
    } catch (err) {
      setActionError(toUserMessage(err, "Failed to save auto-accept rules"));
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        {Array.from({ length: 4 }, (_, i) => `friends-sk-${i}`).map((skId, i) => (
          <motion.div
            key={skId}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.05 }}
          >
            <Skeleton className="h-24 w-full rounded-sm" />
          </motion.div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-500">
        {error}
      </div>
    );
  }

  const inbound = requests.filter((r) => r.direction === "inbound");
  const outbound = requests.filter((r) => r.direction === "outbound");
  const hasPending = inbound.length > 0 || outbound.length > 0;

  // Track card index for staggered entrance
  let cardIndex = 0;

  return (
    <div className="space-y-6">
      {actionError && (
        <div className="rounded-md border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          {actionError}
        </div>
      )}

      {/* Friends List */}
      <motion.div custom={cardIndex++} variants={cardVariants} initial="hidden" animate="visible">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">
              <Users className="size-4" />
              Friends ({friends.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {friends.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <Users className="size-12 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground italic">
                  No friends yet. Discover bots on the network below.
                </p>
              </div>
            ) : (
              <div className="rounded-sm border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden md:table-cell">Shared Capabilities</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <AnimatePresence>
                      {friends.map((friend) => (
                        <motion.tr
                          key={friend.id}
                          exit={{ opacity: 0, x: -20 }}
                          transition={{ duration: 0.15 }}
                          className="transition-colors hover:bg-muted/50 even:bg-muted/20 border-b last:border-b-0"
                        >
                          <TableCell className="font-medium text-sm text-foreground">
                            {friend.name}
                          </TableCell>
                          <TableCell>
                            <FriendStatusBadge status={friend.status} />
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <div className="flex flex-wrap items-center gap-1">
                              {friend.sharedCapabilities.length === 0 ? (
                                <span className="text-xs text-muted-foreground">None</span>
                              ) : (
                                friend.sharedCapabilities.map((cap) => (
                                  <Badge
                                    key={cap}
                                    variant="outline"
                                    className="rounded-sm border-terminal/20 bg-terminal/5 text-terminal-dim text-xs px-1.5 py-0.5 cursor-pointer hover:bg-terminal/10 transition-colors duration-150"
                                    onClick={() =>
                                      handleToggleCapability(
                                        friend.id,
                                        friend.sharedCapabilities,
                                        cap,
                                      )
                                    }
                                  >
                                    {cap} <X className="ml-0.5 size-3 inline" />
                                  </Badge>
                                ))
                              )}
                              <CapabilityAddPopover
                                existing={friend.sharedCapabilities}
                                onAdd={(cap) =>
                                  handleToggleCapability(friend.id, friend.sharedCapabilities, cap)
                                }
                              />
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:bg-destructive/10 h-10 w-10 md:h-auto md:w-auto"
                              onClick={() => handleRemoveFriend(friend.id)}
                              disabled={removingFriend === friend.id}
                              aria-label={`Unfriend ${friend.name}`}
                            >
                              {removingFriend === friend.id ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <>
                                  <Trash2 className="size-3.5 md:mr-1" />
                                  <span className="hidden md:inline">Unfriend</span>
                                </>
                              )}
                            </Button>
                          </TableCell>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Pending Requests */}
      {hasPending && (
        <motion.div custom={cardIndex++} variants={cardVariants} initial="hidden" animate="visible">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">
                <UserPlus className="size-4" />
                Pending Requests ({requests.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {inbound.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-2">Inbound</h4>
                  <div className="rounded-sm border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>From</TableHead>
                          <TableHead className="hidden md:table-cell">Received</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <AnimatePresence>
                          {inbound.map((req) => (
                            <motion.tr
                              key={req.id}
                              exit={{ opacity: 0, x: -20 }}
                              transition={{ duration: 0.15 }}
                              className="transition-colors hover:bg-muted/50 border-l-2 border-l-terminal border-b last:border-b-0"
                            >
                              <TableCell className="font-medium text-sm text-foreground">
                                {req.fromName}
                              </TableCell>
                              <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                                {formatRelativeTime(req.createdAt)}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-terminal/50 text-terminal hover:bg-terminal/10 hover:border-terminal h-10 w-10 md:h-auto md:w-auto"
                                    onClick={() => handleAccept(req.id)}
                                    aria-label={`Accept request from ${req.fromName}`}
                                  >
                                    <Check className="size-3.5 md:mr-1" />
                                    <span className="hidden md:inline">Accept</span>
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-destructive hover:bg-destructive/10 h-10 w-10 md:h-auto md:w-auto"
                                    onClick={() => handleReject(req.id)}
                                    aria-label={`Reject request from ${req.fromName}`}
                                  >
                                    <X className="size-3.5 md:mr-1" />
                                    <span className="hidden md:inline">Reject</span>
                                  </Button>
                                </div>
                              </TableCell>
                            </motion.tr>
                          ))}
                        </AnimatePresence>
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {inbound.length > 0 && outbound.length > 0 && <Separator />}

              {outbound.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-2">Outbound</h4>
                  <div className="rounded-sm border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>To</TableHead>
                          <TableHead className="hidden md:table-cell">Sent</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <AnimatePresence>
                          {outbound.map((req) => (
                            <motion.tr
                              key={req.id}
                              exit={{ opacity: 0, x: -20 }}
                              transition={{ duration: 0.15 }}
                              className="transition-colors hover:bg-muted/50 opacity-80 border-b last:border-b-0"
                            >
                              <TableCell className="font-medium text-sm text-foreground">
                                {req.toName}
                              </TableCell>
                              <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                                {formatRelativeTime(req.createdAt)}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive hover:bg-destructive/10 h-10 w-10 md:h-auto md:w-auto"
                                  onClick={() => handleReject(req.id)}
                                  aria-label={`Cancel request to ${req.toName}`}
                                >
                                  <X className="size-3.5 md:mr-1" />
                                  <span className="hidden md:inline">Cancel</span>
                                </Button>
                              </TableCell>
                            </motion.tr>
                          ))}
                        </AnimatePresence>
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Discovered Bots */}
      <motion.div custom={cardIndex++} variants={cardVariants} initial="hidden" animate="visible">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">
              <Radio className="size-4" />
              Discovered Bots ({discovered.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {discovered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <Radio className="size-12 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground italic">
                  No bots discovered on the network. Your bot may need to be online to discover
                  peers.
                </p>
              </div>
            ) : (
              <div className="rounded-sm border">
                <div className="px-3 py-1.5 border-b text-xs text-muted-foreground">
                  Showing {discovered.length} bot{discovered.length !== 1 ? "s" : ""} on your local
                  network
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead className="hidden md:table-cell">Capabilities</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {discovered.map((bot) => (
                      <TableRow
                        key={bot.id}
                        className="transition-colors hover:bg-terminal/5 even:bg-muted/20"
                      >
                        <TableCell className="font-medium text-sm text-foreground">
                          {bot.name}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {bot.capabilities.map((cap) => (
                              <Badge
                                key={cap}
                                variant="outline"
                                className="rounded-sm border-terminal/20 bg-terminal/5 text-terminal-dim text-xs px-1.5 py-0.5 opacity-70"
                              >
                                {cap}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {sendingTo === bot.id ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-muted-foreground"
                              disabled
                            >
                              <Loader2 className="size-3.5 animate-spin md:mr-1" />
                              <span className="hidden md:inline">Pending...</span>
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-terminal/30 text-terminal-dim hover:border-terminal hover:text-terminal h-10 w-10 md:h-auto md:w-auto"
                              onClick={() => handleSendRequest(bot.id)}
                              aria-label={`Send friend request to ${bot.name}`}
                            >
                              <UserPlus className="size-3.5 md:mr-1" />
                              <span className="hidden md:inline">Send Request</span>
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Auto-Accept Rules */}
      {autoAccept && (
        <motion.div custom={cardIndex++} variants={cardVariants} initial="hidden" animate="visible">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">
                <Shield className="size-4" />
                Auto-Accept Rules
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Auto-accept friend requests</p>
                  <p className="text-xs text-muted-foreground">
                    Automatically accept incoming friend requests matching your rules
                  </p>
                </div>
                <Switch
                  checked={autoAccept.enabled}
                  onCheckedChange={handleToggleAutoAccept}
                  className="data-[state=checked]:bg-terminal"
                  aria-label="Toggle auto-accept"
                />
              </div>

              <AnimatePresence>
                {autoAccept.enabled && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="bg-secondary rounded-sm p-4 mt-3 space-y-3">
                      <div className="space-y-1">
                        <label
                          htmlFor="cap-rules"
                          className="text-xs font-medium text-muted-foreground"
                        >
                          Required capabilities (comma-separated)
                        </label>
                        <Input
                          id="cap-rules"
                          className="text-sm"
                          placeholder="e.g. tts, image-gen"
                          value={capRuleInput}
                          onChange={(e) => setCapRuleInput(e.target.value)}
                          onBlur={handleSaveAutoAcceptRules}
                        />
                      </div>
                      <div className="space-y-1">
                        <label
                          htmlFor="max-friends"
                          className="text-xs font-medium text-muted-foreground"
                        >
                          Max friends
                        </label>
                        <Input
                          id="max-friends"
                          type="number"
                          className="w-20 text-sm"
                          placeholder="--"
                          value={maxFriendsInput}
                          onChange={(e) => setMaxFriendsInput(e.target.value)}
                          onBlur={handleSaveAutoAcceptRules}
                        />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}

function FriendStatusBadge({ status }: { status: "online" | "offline" | "unknown" }) {
  const config = {
    online: {
      label: "Online",
      className: "bg-emerald-500/15 text-emerald-500 border-emerald-500/25",
      dotClass: "bg-emerald-500 animate-pulse",
    },
    offline: {
      label: "Offline",
      className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",
      dotClass: "bg-zinc-500",
    },
    unknown: {
      label: "Unknown",
      className: "bg-yellow-500/15 text-yellow-500 border-yellow-500/25",
      dotClass: "bg-yellow-500",
    },
  };
  const c = config[status];
  return (
    <div className="flex items-center gap-1.5">
      <span className={`size-2 rounded-full ${c.dotClass}`} />
      <Badge variant="outline" className={c.className}>
        {c.label}
      </Badge>
    </div>
  );
}

function CapabilityAddPopover({
  existing,
  onAdd,
}: {
  existing: string[];
  onAdd: (cap: string) => void;
}) {
  const [value, setValue] = useState("");

  function handleAdd() {
    const cap = value.trim();
    if (cap && !existing.includes(cap)) {
      onAdd(cap);
      setValue("");
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-muted-foreground hover:text-terminal"
          aria-label="Add capability"
        >
          <Plus className="size-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2" align="start">
        <div className="flex gap-1">
          <Input
            className="text-xs h-7"
            placeholder="capability"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
          />
          <Button size="sm" variant="ghost" className="h-7 px-2 text-terminal" onClick={handleAdd}>
            <Plus className="size-3" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function formatRelativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d ago`;
}
