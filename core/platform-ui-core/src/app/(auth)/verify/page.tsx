import { CheckCircle2, XCircle } from "lucide-react";
import Link from "next/link";

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; reason?: string }>;
}) {
  const { status, reason } = await searchParams;
  const success = status === "success";

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      {success ? (
        <>
          <CheckCircle2 className="size-12 text-terminal" />
          <h1 className="text-2xl font-bold tracking-tight">Email verified</h1>
          <p className="text-sm text-muted-foreground">
            Your account is active and you&apos;ve been granted $5.00 in free credits.
          </p>
          <Link
            href="/login"
            className="mt-2 inline-flex items-center justify-center rounded-md bg-terminal px-6 py-2 text-sm font-medium text-terminal-foreground hover:bg-terminal/90 transition-colors"
          >
            Sign in
          </Link>
        </>
      ) : (
        <>
          <XCircle className="size-12 text-destructive" />
          <h1 className="text-2xl font-bold tracking-tight">Verification failed</h1>
          <p className="text-sm text-muted-foreground">
            {reason === "missing_token"
              ? "No verification token provided."
              : "This link is invalid or has expired. Please request a new one."}
          </p>
          <Link
            href="/login"
            className="mt-2 inline-flex items-center justify-center rounded-md bg-terminal px-6 py-2 text-sm font-medium text-terminal-foreground hover:bg-terminal/90 transition-colors"
          >
            Back to login
          </Link>
        </>
      )}
    </div>
  );
}
