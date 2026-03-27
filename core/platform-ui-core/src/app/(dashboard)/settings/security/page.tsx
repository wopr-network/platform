"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  MonitorIcon,
  SmartphoneIcon,
  TabletIcon,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
import type { LoginAttempt, LoginHistoryResponse } from "@/lib/api";
import { fetchLoginHistory } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { getBrandConfig, productName } from "@/lib/brand-config";
import { trpc } from "@/lib/trpc";

// ---------- helpers ----------

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function deviceIcon(ua: string) {
  const lower = ua.toLowerCase();
  if (lower.includes("mobile") || lower.includes("iphone") || lower.includes("android")) {
    return SmartphoneIcon;
  }
  if (lower.includes("ipad") || lower.includes("tablet")) {
    return TabletIcon;
  }
  return MonitorIcon;
}

function parseBrowser(ua: string): string {
  if (!ua) return "Unknown";
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Edg")) return "Edge";
  if (ua.includes("Chrome")) return "Chrome";
  if (ua.includes("Safari")) return "Safari";
  if (ua.includes("Opera") || ua.includes("OPR")) return "Opera";
  return ua.length > 40 ? `${ua.slice(0, 40)}...` : ua;
}

function parseOS(ua: string): string {
  if (!ua) return "";
  if (ua.includes("Windows")) return "Windows";
  if (ua.includes("Mac OS")) return "macOS";
  if (ua.includes("Linux")) return "Linux";
  if (ua.includes("Android")) return "Android";
  if (ua.includes("iPhone") || ua.includes("iPad")) return "iOS";
  return "";
}

// ---------- types ----------

interface Session {
  id: string;
  token: string;
  expiresAt: Date | string;
  userAgent?: string;
  ipAddress?: string;
  current?: boolean;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

// ---------- step indicator ----------

function StepIndicator({ currentStep, steps }: { currentStep: number; steps: string[] }) {
  return (
    <div className="flex items-center justify-center gap-0 px-4 py-2">
      {steps.map((label, i) => (
        <div key={label} className="flex items-center">
          {i > 0 && (
            <div
              className={`h-px w-8 sm:w-12 ${i <= currentStep ? "bg-terminal/40" : "bg-border"}`}
            />
          )}
          <div className="flex flex-col items-center gap-1">
            <div
              className={`flex size-8 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                i < currentStep
                  ? "bg-terminal/20 text-terminal"
                  : i === currentStep
                    ? "bg-terminal text-primary-foreground"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {i < currentStep ? <CheckIcon className="size-4" /> : i + 1}
            </div>
            <span
              className={`text-xs ${i === currentStep ? "font-medium text-foreground" : "text-muted-foreground"}`}
            >
              {label}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- 2FA section ----------

function TwoFactorSection() {
  const {
    data: profileData,
    error: profileError,
    isPending: profilePending,
  } = trpc.profile.getProfile.useQuery(undefined, {
    retry: false,
  });
  const utils = trpc.useUtils();
  const [enabled, setEnabled] = useState(false);
  const [codesRemaining, setCodesRemaining] = useState(8);
  const [error, setError] = useState<string | null>(null);

  // enable flow
  const [enableOpen, setEnableOpen] = useState(false);
  const [enableStep, setEnableStep] = useState(0);
  const [enablePassword, setEnablePassword] = useState("");
  const [enablePasswordError, setEnablePasswordError] = useState<string | null>(null);
  const [enablePasswordLoading, setEnablePasswordLoading] = useState(false);
  const [totpUri, setTotpUri] = useState("");
  const [totpSecret, setTotpSecret] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // disable flow
  const [disableOpen, setDisableOpen] = useState(false);
  const [disableCode, setDisableCode] = useState("");
  const [disableError, setDisableError] = useState<string | null>(null);
  const [disabling, setDisabling] = useState(false);

  // regen flow
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenCode, setRegenCode] = useState("");
  const [regenError, setRegenError] = useState<string | null>(null);
  const [regenCodes, setRegenCodes] = useState<string[]>([]);
  const [regenStep, setRegenStep] = useState<"verify" | "codes">("verify");
  const [regenVerifying, setRegenVerifying] = useState(false);

  useEffect(() => {
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, []);

  useEffect(() => {
    setEnabled(
      Boolean((profileData as { twoFactorEnabled?: boolean } | undefined)?.twoFactorEnabled),
    );
  }, [profileData]);

  function handleStartEnable() {
    setEnableStep(-1);
    setEnablePassword("");
    setEnablePasswordError(null);
    setVerifyCode("");
    setVerifyError(null);
    setRecoveryCodes([]);
    setError(null);
    setEnableOpen(true);
  }

  async function handleEnableWithPassword() {
    setEnablePasswordLoading(true);
    setEnablePasswordError(null);
    try {
      const res = await authClient.twoFactor.enable({ password: enablePassword });
      const data = res?.data as { totpURI?: string; backupCodes?: string[] } | undefined;
      const uri = data?.totpURI ?? "";
      setTotpUri(uri);
      // extract secret from URI
      const match = uri.match(/secret=([A-Z2-7]+)/i);
      setTotpSecret(match?.[1] ?? "");
      if (data?.backupCodes) {
        setRecoveryCodes(data.backupCodes);
      }
      setEnableStep(0);
    } catch {
      setEnablePasswordError("Incorrect password. Please try again.");
    } finally {
      setEnablePasswordLoading(false);
    }
  }

  async function handleVerify() {
    setVerifying(true);
    setVerifyError(null);
    try {
      await authClient.twoFactor.verifyTotp({ code: verifyCode });
      await utils.profile.getProfile.invalidate();
      setEnableStep(2);
      setEnabled(true);
    } catch {
      setVerifyError("Invalid code. Please try again.");
    } finally {
      setVerifying(false);
    }
  }

  async function handleDisable() {
    setDisabling(true);
    setDisableError(null);
    try {
      await authClient.twoFactor.disable({ password: disableCode });
      await utils.profile.getProfile.invalidate();
      setEnabled(false);
      setDisableOpen(false);
      setDisableCode("");
    } catch {
      setDisableError("Invalid code. Please try again.");
    } finally {
      setDisabling(false);
    }
  }

  async function handleRegenVerify() {
    setRegenVerifying(true);
    setRegenError(null);
    try {
      const res = await authClient.twoFactor.generateBackupCodes({
        password: regenCode,
      });
      const data = res?.data as { backupCodes?: string[] } | undefined;
      setRegenCodes(data?.backupCodes ?? []);
      setRegenStep("codes");
      setCodesRemaining(data?.backupCodes?.length ?? 8);
    } catch {
      setRegenError("Invalid code. Please try again.");
    } finally {
      setRegenVerifying(false);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    copiedTimer.current = setTimeout(() => setCopied(false), 2000);
  }

  function downloadCodes(codes: string[]) {
    const text = `${productName()} Recovery Codes\nGenerated: ${new Date().toISOString()}\n\n${codes.join("\n")}\n\nEach code can only be used once.`;
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${getBrandConfig().storagePrefix}-recovery-codes.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (profilePending) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Two-Factor Authentication</CardTitle>
          <CardDescription>Add an extra layer of security to your account</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-9 w-28" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (profileError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Two-Factor Authentication</CardTitle>
          <CardDescription>Add an extra layer of security to your account</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-destructive text-sm">Failed to load security settings</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
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

      <Card>
        <CardHeader>
          <CardTitle>Two-Factor Authentication</CardTitle>
          <CardDescription>Add an extra layer of security to your account</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {enabled ? (
            <>
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-terminal animate-pulse" />
                <span className="text-sm font-medium text-terminal">
                  Two-factor authentication is active
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setDisableOpen(true)}>
                  Disable 2FA
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setRegenStep("verify");
                    setRegenCode("");
                    setRegenError(null);
                    setRegenCodes([]);
                    setRegenOpen(true);
                  }}
                >
                  View recovery codes
                </Button>
              </div>
              {codesRemaining <= 2 && (
                <p className="text-xs text-chart-3">
                  {codesRemaining} of 8 recovery codes remaining
                </p>
              )}
              {codesRemaining > 2 && (
                <p className="text-xs text-muted-foreground">
                  {codesRemaining} of 8 recovery codes remaining
                </p>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-chart-3" />
                <span className="text-sm font-medium text-chart-3">
                  Two-factor authentication is not enabled
                </span>
              </div>
              <Button variant="terminal" onClick={handleStartEnable}>
                Enable 2FA
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Enable 2FA Dialog */}
      <Dialog open={enableOpen} onOpenChange={setEnableOpen}>
        <DialogContent className="max-w-md">
          {enableStep >= 0 && (
            <StepIndicator currentStep={enableStep} steps={["Scan", "Verify", "Backup"]} />
          )}

          {enableStep === -1 && (
            <>
              <DialogHeader>
                <DialogTitle>Confirm your password</DialogTitle>
                <DialogDescription>
                  Enter your password to set up two-factor authentication
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col items-center gap-3">
                <Input
                  type="password"
                  value={enablePassword}
                  onChange={(e) => setEnablePassword(e.target.value)}
                  className={`w-full ${enablePasswordError ? "border-destructive" : ""}`}
                  placeholder="Your account password"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && enablePassword.length > 0 && !enablePasswordLoading) {
                      handleEnableWithPassword();
                    }
                  }}
                />
                <AnimatePresence>
                  {enablePasswordError && (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="text-sm text-destructive"
                    >
                      {enablePasswordError}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button
                  variant="terminal"
                  disabled={enablePassword.length === 0 || enablePasswordLoading}
                  onClick={handleEnableWithPassword}
                >
                  {enablePasswordLoading ? "Verifying..." : "Continue"}
                </Button>
              </DialogFooter>
            </>
          )}

          {enableStep === 0 && (
            <>
              <DialogHeader>
                <DialogTitle>Set up authenticator</DialogTitle>
                <DialogDescription>
                  Scan this QR code with your authenticator app (Google Authenticator, Authy,
                  1Password)
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col items-center gap-4">
                {/* bg-white is intentional -- QR codes require white background for scanability */}
                <div className="rounded-sm border border-border bg-white p-3">
                  <QRCodeSVG value={totpUri} size={192} />
                </div>
                <div className="w-full space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Can&apos;t scan? Enter this key manually:
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded-sm bg-muted px-3 py-2 text-xs font-mono tracking-widest">
                      {totpSecret}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => copyToClipboard(totpSecret)}
                    >
                      <CopyIcon className="size-4" />
                    </Button>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="terminal" onClick={() => setEnableStep(1)}>
                  Next
                </Button>
              </DialogFooter>
            </>
          )}

          {enableStep === 1 && (
            <>
              <DialogHeader>
                <DialogTitle>Verify your code</DialogTitle>
                <DialogDescription>
                  Enter the 6-digit code from your authenticator app
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col items-center gap-3">
                <Input
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className={`w-48 text-center text-2xl tracking-[0.5em] font-mono ${verifyError ? "border-destructive" : ""}`}
                  maxLength={6}
                  inputMode="numeric"
                  autoFocus
                />
                <AnimatePresence>
                  {verifyError && (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="text-sm text-destructive"
                    >
                      {verifyError}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setEnableStep(0)}>
                  Back
                </Button>
                <Button
                  variant="terminal"
                  disabled={verifyCode.length !== 6 || verifying}
                  onClick={handleVerify}
                >
                  {verifying ? "Verifying..." : "Verify"}
                </Button>
              </DialogFooter>
            </>
          )}

          {enableStep === 2 && (
            <>
              <DialogHeader>
                <DialogTitle>Save your recovery codes</DialogTitle>
                <DialogDescription>
                  Store these codes in a safe place. Each code can only be used once. You won&apos;t
                  be able to see them again.
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-2">
                {recoveryCodes.map((code) => (
                  <div
                    key={code}
                    className="rounded-sm bg-muted px-3 py-2 text-center text-sm font-mono tracking-widest text-foreground"
                  >
                    {code}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(recoveryCodes.join("\n"))}
                >
                  <CopyIcon className="mr-1 size-4" />
                  {copied ? "Copied" : "Copy all"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => downloadCodes(recoveryCodes)}>
                  <DownloadIcon className="mr-1 size-4" />
                  Download
                </Button>
              </div>
              <div className="rounded-sm border border-chart-3/20 bg-chart-3/10 px-3 py-2 text-xs text-chart-3">
                These codes will not be shown again. Save them now.
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="terminal">I&apos;ve saved these codes</Button>
                </DialogClose>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Disable 2FA Dialog */}
      <Dialog open={disableOpen} onOpenChange={setDisableOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Disable two-factor authentication</DialogTitle>
            <DialogDescription>
              Enter your current authenticator code to confirm. This will remove 2FA protection from
              your account.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-sm border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Your account will be less secure without 2FA.
          </div>
          <div className="flex flex-col items-center gap-3">
            <Input
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className={`w-48 text-center text-2xl tracking-[0.5em] font-mono ${disableError ? "border-destructive" : ""}`}
              maxLength={6}
              inputMode="numeric"
              autoFocus
            />
            <AnimatePresence>
              {disableError && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="text-sm text-destructive"
                >
                  {disableError}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={disableCode.length !== 6 || disabling}
              onClick={handleDisable}
            >
              {disabling ? "Disabling..." : "Disable 2FA"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Regenerate Recovery Codes Dialog */}
      <Dialog open={regenOpen} onOpenChange={setRegenOpen}>
        <DialogContent className="max-w-md">
          {regenStep === "verify" && (
            <>
              <DialogHeader>
                <DialogTitle>Regenerate recovery codes</DialogTitle>
                <DialogDescription>
                  Enter your authenticator code to generate new recovery codes. This will invalidate
                  all previous codes.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col items-center gap-3">
                <Input
                  value={regenCode}
                  onChange={(e) => setRegenCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className={`w-48 text-center text-2xl tracking-[0.5em] font-mono ${regenError ? "border-destructive" : ""}`}
                  maxLength={6}
                  inputMode="numeric"
                  autoFocus
                />
                <AnimatePresence>
                  {regenError && (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="text-sm text-destructive"
                    >
                      {regenError}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button
                  variant="terminal"
                  disabled={regenCode.length !== 6 || regenVerifying}
                  onClick={handleRegenVerify}
                >
                  {regenVerifying ? "Verifying..." : "Generate codes"}
                </Button>
              </DialogFooter>
            </>
          )}

          {regenStep === "codes" && (
            <>
              <DialogHeader>
                <DialogTitle>New recovery codes</DialogTitle>
                <DialogDescription>
                  Your previous codes have been invalidated. Save these new codes in a safe place.
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-2">
                {regenCodes.map((code) => (
                  <div
                    key={code}
                    className="rounded-sm bg-muted px-3 py-2 text-center text-sm font-mono tracking-widest text-foreground"
                  >
                    {code}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(regenCodes.join("\n"))}
                >
                  <CopyIcon className="mr-1 size-4" />
                  {copied ? "Copied" : "Copy all"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => downloadCodes(regenCodes)}>
                  <DownloadIcon className="mr-1 size-4" />
                  Download
                </Button>
              </div>
              <div className="rounded-sm border border-chart-3/20 bg-chart-3/10 px-3 py-2 text-xs text-chart-3">
                These codes will not be shown again. Save them now.
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="terminal">I&apos;ve saved these codes</Button>
                </DialogClose>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------- sessions section ----------

function SessionsSection() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await authClient.listSessions();
      setSessions((res?.data as Session[]) ?? []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRevoke(token: string) {
    setRevokingId(token);
    setRevokeError(null);
    try {
      await authClient.revokeSession({ token });
      setSessions((prev) => prev.filter((s) => s.token !== token));
    } catch {
      setRevokeError("Failed to revoke session. Please try again.");
    } finally {
      setRevokingId(null);
    }
  }

  async function handleRevokeAll() {
    setRevokingAll(true);
    setRevokeError(null);
    try {
      await authClient.revokeOtherSessions();
      setSessions((prev) => prev.filter((s) => s.current));
    } catch {
      setRevokeError("Failed to revoke sessions. Please try again.");
    } finally {
      setRevokingAll(false);
    }
  }

  if (loadError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Active Sessions</CardTitle>
          <CardDescription>Devices currently signed into your account</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-24 flex-col items-center justify-center gap-3">
            <p className="text-sm text-destructive">Failed to load sessions.</p>
            <Button variant="outline" size="sm" onClick={load}>
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Active Sessions</CardTitle>
            <CardDescription>Devices currently signed into your account</CardDescription>
          </div>
          {!loading && sessions.length > 1 && (
            <Button
              variant="destructive"
              size="sm"
              disabled={revokingAll}
              onClick={handleRevokeAll}
            >
              {revokingAll ? "Revoking..." : "Revoke all other sessions"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {revokeError && (
          <div className="mb-3 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {revokeError}
          </div>
        )}
        {loading ? (
          <div className="space-y-3">
            {["s1", "s2", "s3"].map((id) => (
              <div key={id} className="flex gap-4">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex h-24 items-center justify-center">
            <p className="text-sm text-muted-foreground">No active sessions found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[500px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs uppercase tracking-wider font-medium text-muted-foreground">
                    Device
                  </TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-medium text-muted-foreground">
                    IP Address
                  </TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-medium text-muted-foreground">
                    Last Active
                  </TableHead>
                  <TableHead className="w-[100px] text-xs uppercase tracking-wider font-medium text-muted-foreground">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((session) => {
                  const ua = session.userAgent ?? "";
                  const Icon = deviceIcon(ua);
                  const browser = parseBrowser(ua);
                  const os = parseOS(ua);
                  return (
                    <TableRow
                      key={session.token}
                      className={`transition-colors duration-150 ${session.current ? "bg-terminal/5" : "hover:bg-accent/50"}`}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Icon className="size-4 text-muted-foreground" />
                          <span className="text-sm">
                            {browser}
                            {os ? ` on ${os}` : ""}
                          </span>
                          {session.current && <Badge variant="terminal">Current</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {session.ipAddress ?? "\u2014"}
                      </TableCell>
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger className="text-xs text-muted-foreground">
                            {relativeTime(
                              String(session.updatedAt ?? session.createdAt ?? session.expiresAt),
                            )}
                          </TooltipTrigger>
                          <TooltipContent>
                            {new Date(
                              session.updatedAt ?? session.createdAt ?? session.expiresAt,
                            ).toLocaleString()}
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        {session.current ? (
                          <span className="text-xs text-muted-foreground">This device</span>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={revokingId === session.token}
                            className="hover:border-destructive/50 hover:text-destructive"
                            onClick={() => handleRevoke(session.token)}
                          >
                            {revokingId === session.token ? "Revoking..." : "Revoke"}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- login history section ----------

const LOGIN_PAGE_SIZE = 20;

function LoginHistorySection() {
  const [data, setData] = useState<LoginHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [offset, setOffset] = useState(0);

  const load = useCallback(async (newOffset: number) => {
    setLoading(true);
    setLoadError(false);
    try {
      const result = await fetchLoginHistory({
        limit: LOGIN_PAGE_SIZE,
        offset: newOffset,
      });
      setData(result);
      setOffset(newOffset);
    } catch (err) {
      // 404 = endpoint not available yet
      if (err instanceof Error && err.message.includes("404")) {
        setUnavailable(true);
      } else {
        setLoadError(true);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(0);
  }, [load]);

  if (unavailable) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Login History</CardTitle>
          <CardDescription>Recent authentication events</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-24 items-center justify-center">
            <p className="text-sm text-muted-foreground">Login history is not available yet.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loadError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Login History</CardTitle>
          <CardDescription>Recent authentication events</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-24 flex-col items-center justify-center gap-3">
            <p className="text-sm text-destructive">Failed to load login history.</p>
            <Button variant="outline" size="sm" onClick={() => load(offset)}>
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Login History</CardTitle>
        <CardDescription>
          {data ? `${data.total} total events` : "Recent authentication events"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {["s1", "s2", "s3", "s4", "s5"].map((id) => (
              <div key={id} className="flex gap-4">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        ) : !data || data.attempts.length === 0 ? (
          <div className="flex h-24 items-center justify-center">
            <p className="text-sm text-muted-foreground">No login history yet.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table className="min-w-[500px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px] text-xs uppercase tracking-wider font-medium text-muted-foreground">
                      Time
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wider font-medium text-muted-foreground">
                      Device
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wider font-medium text-muted-foreground">
                      IP Address
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wider font-medium text-muted-foreground">
                      Location
                    </TableHead>
                    <TableHead className="w-[80px] text-xs uppercase tracking-wider font-medium text-muted-foreground">
                      Result
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.attempts.map((attempt: LoginAttempt) => (
                    <TableRow
                      key={attempt.id}
                      className={`transition-colors duration-150 ${attempt.success ? "hover:bg-accent/50" : "bg-destructive/5 hover:bg-destructive/10"}`}
                    >
                      <TableCell className="w-[100px]">
                        <Tooltip>
                          <TooltipTrigger className="text-xs text-muted-foreground">
                            {relativeTime(attempt.timestamp)}
                          </TooltipTrigger>
                          <TooltipContent>
                            {new Date(attempt.timestamp).toLocaleString()}
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {parseBrowser(attempt.userAgent)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{attempt.ip}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {attempt.location ?? "\u2014"}
                      </TableCell>
                      <TableCell>
                        {attempt.success ? (
                          <Badge variant="terminal">Success</Badge>
                        ) : (
                          <Badge variant="destructive">Failed</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {data.total > LOGIN_PAGE_SIZE && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Showing {offset + 1}&ndash;
                  {Math.min(offset + LOGIN_PAGE_SIZE, data.total)} of {data.total}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={offset === 0}
                    onClick={() => load(Math.max(0, offset - LOGIN_PAGE_SIZE))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!data.hasMore}
                    onClick={() => load(offset + LOGIN_PAGE_SIZE)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- page ----------

export default function SecurityPage() {
  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Security</h1>
        <p className="text-sm text-muted-foreground">Manage your account security settings</p>
      </div>

      <TwoFactorSection />
      <SessionsSection />
      <LoginHistorySection />
    </div>
  );
}
