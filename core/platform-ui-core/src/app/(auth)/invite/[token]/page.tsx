"use client";

import { BuildingIcon, CheckCircleIcon, Loader2Icon, XCircleIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession } from "@/lib/auth-client";
import { productName } from "@/lib/brand-config";
import { acceptInvite } from "@/lib/org-api";

type InviteState = "loading" | "accepting" | "success" | "error" | "login-required";

export default function InviteAcceptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { data: session, isPending: sessionLoading } = useSession();
  const router = useRouter();
  const [state, setState] = useState<InviteState>("loading");
  const [orgName, setOrgName] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const acceptedRef = useRef(false);

  const doAccept = useCallback(async () => {
    if (acceptedRef.current) return;
    acceptedRef.current = true;

    setState("accepting");
    try {
      const result = await acceptInvite(token);
      setOrgName(result.orgName ?? "your organization");
      setState("success");
      // Redirect to dashboard after brief success message
      setTimeout(() => router.push("/"), 2000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to accept invite";
      // Surface specific error messages from the backend
      if (msg.includes("already a member")) {
        setErrorMessage("You are already a member of this organization.");
      } else if (msg.includes("expired")) {
        setErrorMessage("This invite has expired. Please ask the admin to send a new one.");
      } else if (msg.includes("revoked")) {
        setErrorMessage("This invite has been revoked.");
      } else if (msg.includes("not found")) {
        setErrorMessage("Invalid invite link. It may have already been used.");
      } else {
        setErrorMessage(msg);
      }
      setState("error");
      acceptedRef.current = false;
    }
  }, [token, router]);

  useEffect(() => {
    if (sessionLoading) return;

    if (!session?.user) {
      // Not logged in — redirect to login with callback
      setState("login-required");
      const callbackUrl = encodeURIComponent(`/invite/${token}`);
      router.push(`/login?callbackUrl=${callbackUrl}`);
      return;
    }

    // User is logged in — accept the invite
    doAccept();
  }, [session, sessionLoading, token, router, doAccept]);

  return (
    <Card className="border-terminal/20 bg-card/80 backdrop-blur-sm">
      <CardHeader className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-terminal/10">
          <BuildingIcon className="h-6 w-6 text-terminal" />
        </div>
        <CardTitle className="text-lg font-semibold tracking-tight">Organization Invite</CardTitle>
        <CardDescription>
          {state === "loading" && "Checking your session..."}
          {state === "login-required" && "Redirecting to sign in..."}
          {state === "accepting" && `Joining organization on ${productName()}...`}
          {state === "success" && `Welcome to ${orgName}!`}
          {state === "error" && "Something went wrong"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4 pb-8">
        {(state === "loading" || state === "login-required" || state === "accepting") && (
          <Loader2Icon className="h-8 w-8 animate-spin text-terminal/60" />
        )}

        {state === "success" && (
          <>
            <CheckCircleIcon className="h-8 w-8 text-emerald-500" />
            <p className="text-sm text-muted-foreground">Redirecting to your dashboard...</p>
          </>
        )}

        {state === "error" && (
          <>
            <XCircleIcon className="h-8 w-8 text-destructive" />
            <p className="text-sm text-muted-foreground text-center">{errorMessage}</p>
            <button
              type="button"
              onClick={() => router.push("/")}
              className="mt-2 text-sm font-medium text-terminal hover:text-terminal/80 underline underline-offset-4"
            >
              Go to dashboard
            </button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
