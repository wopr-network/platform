"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CameraIcon, CheckIcon } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import type { UserProfile } from "@/lib/api";
import { changePassword, deleteAccount, getProfile, updateProfile, uploadAvatar } from "@/lib/api";
import { linkSocial, listAccounts, unlinkAccount } from "@/lib/auth-client";

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectedProviders, setConnectedProviders] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwError, setPwError] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [changingPw, setChangingPw] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveSuccessTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pwSuccessTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (saveSuccessTimer.current) clearTimeout(saveSuccessTimer.current);
      if (pwSuccessTimer.current) clearTimeout(pwSuccessTimer.current);
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const p = await getProfile();
      setProfile(p);
      setName(p.name);
      setEmail(p.email);
      try {
        const accounts = await listAccounts();
        const providerIds = ((accounts.data ?? []) as { providerId: string }[]).map(
          (a) => a.providerId,
        );
        const providers = new Set<string>(providerIds);
        setConnectedProviders(providers);
      } catch {
        setConnectedProviders(
          new Set(p.oauthConnections.filter((c) => c.connected).map((c) => c.provider)),
        );
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError("File size must be under 2MB");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const updated = await uploadAvatar(file);
      setProfile(updated);
    } catch {
      setError("Failed to upload avatar. Please try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveMsg(null);
    setError(null);
    try {
      const updated = await updateProfile({ name, email });
      setProfile(updated);
      setSaveMsg("Profile updated.");
      setSaveSuccess(true);
      saveSuccessTimer.current = setTimeout(() => setSaveSuccess(false), 2000);
    } catch {
      setError("Failed to update profile. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    setPwError(false);
    if (newPassword !== confirmPassword) {
      setPwMsg("Passwords do not match.");
      setPwError(true);
      return;
    }
    setChangingPw(true);
    try {
      await changePassword({ currentPassword, newPassword });
      setPwMsg("Password changed.");
      setPwError(false);
      setPwSuccess(true);
      pwSuccessTimer.current = setTimeout(() => setPwSuccess(false), 2000);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setPwMsg("Failed to change password.");
      setPwError(true);
    } finally {
      setChangingPw(false);
    }
  }

  async function handleOauthConnect(provider: string) {
    setError(null);
    try {
      await linkSocial({
        provider,
        callbackURL: "/settings/profile",
      });
    } catch {
      setError(`Failed to connect ${provider}. Please try again.`);
    }
  }

  async function handleOauthDisconnect(provider: string) {
    setError(null);
    try {
      await unlinkAccount({ providerId: provider });
    } catch {
      setError(`Failed to disconnect ${provider}. Please try again.`);
    } finally {
      await load();
    }
  }

  async function handleDelete() {
    setError(null);
    try {
      await deleteAccount();
      window.location.href = "/login";
    } catch {
      setError("Failed to delete account. Please try again.");
    }
  }

  if (loadError) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-3 text-muted-foreground">
        <p className="text-sm text-destructive">Failed to load profile.</p>
        <Button variant="outline" size="sm" onClick={load}>
          Retry
        </Button>
      </div>
    );
  }

  if (loading || !profile) {
    return (
      <div className="max-w-2xl space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="rounded-sm border p-6 space-y-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64" />
          <div className="space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-9 w-full" />
          </div>
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground">Manage your account settings</p>
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

      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
          <CardDescription>Update your display name and email address</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-6">
            <button
              type="button"
              className="relative size-16 rounded-full bg-muted flex items-center justify-center overflow-hidden group"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {profile.avatarUrl ? (
                // biome-ignore lint/performance/noImgElement: external avatar URL — domain not configured for next/image
                <img
                  src={profile.avatarUrl}
                  alt={profile.name}
                  className="size-full object-cover"
                />
              ) : (
                <span className="text-xl font-semibold text-muted-foreground">
                  {profile.name.charAt(0).toUpperCase()}
                </span>
              )}
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <CameraIcon className="size-5 text-white" />
              </div>
            </button>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                aria-label="Change avatar"
                className="sr-only"
                onChange={handleAvatarChange}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? "Uploading..." : "Change avatar"}
              </Button>
              <p className="text-xs text-muted-foreground mt-1">JPG, PNG, GIF. Max 2MB.</p>
            </div>
          </div>
          <form onSubmit={handleSaveProfile} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="profile-name">Display name</Label>
              <Input
                id="profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="profile-email">Email</Label>
              <Input
                id="profile-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <AnimatePresence>
              {saveMsg && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="text-sm text-terminal"
                >
                  {saveMsg}
                </motion.p>
              )}
            </AnimatePresence>
            <Button type="submit" variant="terminal" className="w-fit" disabled={saving}>
              <AnimatePresence mode="wait">
                {saveSuccess ? (
                  <motion.span
                    key="success"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="flex items-center gap-1"
                  >
                    <CheckIcon className="size-4" />
                    Saved
                  </motion.span>
                ) : (
                  <motion.span
                    key="save"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    {saving ? "Saving..." : "Save changes"}
                  </motion.span>
                )}
              </AnimatePresence>
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>Update your account password</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="current-password">Current password</Label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="confirm-new-password">Confirm new password</Label>
              <Input
                id="confirm-new-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            <AnimatePresence>
              {pwMsg && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className={`text-sm ${pwError ? "text-destructive" : "text-terminal"}`}
                >
                  {pwMsg}
                </motion.p>
              )}
            </AnimatePresence>
            <Button type="submit" variant="terminal" className="w-fit" disabled={changingPw}>
              <AnimatePresence mode="wait">
                {pwSuccess ? (
                  <motion.span
                    key="success"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="flex items-center gap-1"
                  >
                    <CheckIcon className="size-4" />
                    Changed
                  </motion.span>
                ) : (
                  <motion.span
                    key="default"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    {changingPw ? "Changing..." : "Change password"}
                  </motion.span>
                )}
              </AnimatePresence>
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connected Accounts</CardTitle>
          <CardDescription>Link or unlink OAuth providers</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {["github", "discord", "google"].map((provider) => {
              const connected = connectedProviders.has(provider);
              return (
                <div key={provider} className="flex items-center justify-between">
                  <span className="text-sm font-medium capitalize">{provider}</span>
                  <Button
                    variant={connected ? "outline" : "default"}
                    size="sm"
                    onClick={() =>
                      connected ? handleOauthDisconnect(provider) : handleOauthConnect(provider)
                    }
                  >
                    {connected ? "Disconnect" : "Connect"}
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Danger zone separator */}
      <div className="flex items-center gap-3 pt-4">
        <Separator className="flex-1 bg-destructive/30" />
        <span className="text-xs font-mono text-destructive/70">DANGER ZONE</span>
        <Separator className="flex-1 bg-destructive/30" />
      </div>

      <Card className="border-destructive/50 bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-destructive">Delete Account</CardTitle>
          <CardDescription>
            Permanently delete your account and all associated data. This action cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="destructive">Delete account</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Are you absolutely sure?</DialogTitle>
                <DialogDescription>
                  This will permanently delete your account, all instances, and data. Type{" "}
                  <strong>delete my account</strong> to confirm.
                </DialogDescription>
              </DialogHeader>
              <Input
                placeholder="delete my account"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
              />
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button
                  variant="destructive"
                  disabled={deleteConfirm !== "delete my account"}
                  onClick={handleDelete}
                >
                  Delete permanently
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
}
