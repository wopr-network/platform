"use client";

import { AnimatePresence, motion } from "framer-motion";
import { BuildingIcon, CheckCircleIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createOrganization } from "@/lib/org-api";

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

type Step = "name" | "confirm" | "done";

export default function CreateOrgWizard() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("name");
  const [orgName, setOrgName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStep("name");
    setOrgName("");
    setSlug("");
    setSlugTouched(false);
    setCreating(false);
    setError(null);
  }, []);

  function handleNameChange(value: string) {
    setOrgName(value);
    if (!slugTouched) {
      setSlug(toSlug(value));
    }
  }

  function handleSlugChange(value: string) {
    setSlugTouched(true);
    setSlug(toSlug(value));
  }

  function handleNext(e: FormEvent) {
    e.preventDefault();
    if (!orgName.trim() || !slug.trim()) return;
    setError(null);
    setStep("confirm");
  }

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      await createOrganization({ name: orgName.trim(), slug: slug.trim() });
      setStep("done");
    } catch (err) {
      const message =
        err instanceof Error && err.message.includes("409")
          ? "This slug is already taken. Go back and choose a different one."
          : "Failed to create organization. Please try again.";
      setError(message);
    } finally {
      setCreating(false);
    }
  }

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (v) reset();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="terminal">
          <BuildingIcon className="mr-2 size-4" />
          Create organization
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <AnimatePresence mode="wait">
          {step === "name" && (
            <motion.div
              key="name"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.15 }}
            >
              <DialogHeader>
                <DialogTitle>Name your organization</DialogTitle>
                <DialogDescription>Choose a name and URL slug for your team.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleNext} className="mt-4 flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="org-wizard-name">Organization name</Label>
                  <Input
                    id="org-wizard-name"
                    placeholder="Acme Corp"
                    value={orgName}
                    onChange={(e) => handleNameChange(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="org-wizard-slug">Slug</Label>
                  <Input
                    id="org-wizard-slug"
                    placeholder="acme-corp"
                    value={slug}
                    onChange={(e) => handleSlugChange(e.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Used in URLs. Lowercase letters, numbers, and hyphens only.
                  </p>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={!orgName.trim() || !slug.trim()}>
                    Next
                  </Button>
                </DialogFooter>
              </form>
            </motion.div>
          )}

          {step === "confirm" && (
            <motion.div
              key="confirm"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.15 }}
            >
              <DialogHeader>
                <DialogTitle>Confirm</DialogTitle>
                <DialogDescription>
                  You{"'"}ll be the admin. You can invite members after setup.
                </DialogDescription>
              </DialogHeader>
              <div className="mt-4 space-y-3">
                <div className="rounded-md border px-4 py-3 text-sm">
                  <p>
                    <span className="text-muted-foreground">Name:</span> <strong>{orgName}</strong>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Slug:</span>{" "}
                    <code className="text-xs">{slug}</code>
                  </p>
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
              <DialogFooter className="mt-4 gap-2 sm:gap-0">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => {
                    setStep("name");
                    setError(null);
                  }}
                >
                  Back
                </Button>
                <Button variant="terminal" onClick={handleCreate} disabled={creating}>
                  {creating ? "Creating..." : "Create"}
                </Button>
              </DialogFooter>
            </motion.div>
          )}

          {step === "done" && (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
            >
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CheckCircleIcon className="size-5 text-terminal" />
                  Organization created
                </DialogTitle>
                <DialogDescription>
                  Your organization is ready. You can now invite members and configure settings.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="mt-4">
                <Button
                  variant="terminal"
                  onClick={() => {
                    setOpen(false);
                    router.push("/settings/org");
                  }}
                >
                  Go to organization settings
                </Button>
              </DialogFooter>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
